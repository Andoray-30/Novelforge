# Deep Synthesis 设计文档

> 阶段：Phase G - Deep Synthesis 设计
> 状态：设计完成，待实现
> 日期：2026-06-16

---

## 1. 概述

Deep Synthesis 是 NovelForge 提取流水线的第 5 阶段，负责**跨资产/跨章节综合、冲突消解、质量收敛**。它在 `extractor_fast → extractor_repair → extractor_deep → judge` 之后运行，对已抽取的结构化资产进行一致性重写和冲突合并。

### 与 deep_asset_enrichment 的区别

| 维度 | deep_asset_enrichment | Deep Synthesis |
|------|----------------------|----------------|
| 语义 | 补强弱资产 | 跨资产综合、冲突消解 |
| 范围 | 单资产字段补充 | 跨对象一致性重写 |
| 轮次 | 单轮 | 多轮收敛（最多 2-3 轮） |
| 输出 | 直接写库 | preview patch，用户确认后 apply |
| 任务类型 | `deep_asset_enrichment` | `deep_synthesis`（新增） |

---

## 2. 输入边界

Deep Synthesis **只消费已抽取的结构化资产**，不直接消费真实小说原文。

### 允许的输入

```
- 已抽取的结构化资产（characters, relationships, events, world_facts）
- 章节级/项目级质量评分
- 低置信字段列表（confidence < medium）
- 冲突列表（跨章节不一致）
- 缺失关系（孤立节点、断链）
- 已有摘要（evidence labels，截断到 200 字符）
- 用户选择的 synthesis scope（角色/地点/关系/全量）
- 预算档位（low/medium/high）
```

### 禁止的输入

```
- 真实小说正文（chapter_content）
- raw_response_text / raw_response_preview
- provider 原始错误长 body
- 用户原文的完整段落
```

### 脱敏规则

如果需要上下文，只传：
- 短摘要（≤200 字符）
- evidence labels（截断）
- 角色名/地点名/关系类型（结构化字段）

---

## 3. 输出 Schema

Deep Synthesis 输出 **preview patch**，不是直接写库结果。

### 顶层结构

```typescript
interface DeepSynthesisPreview {
  summary: string;                    // 本次综合摘要
  proposed_changes: ProposedChange[]; // 建议的变更列表
  conflicts_resolved: Conflict[];     // 已解决的冲突
  new_links: NewLink[];              // 新发现的关系
  risk_flags: RiskFlag[];           // 风险标记
  confidence_delta: number;         // 置信度变化
  evidence_refs: EvidenceRef[];     // 证据引用
  apply_plan: ApplyPlan;           // 应用计划
  requires_user_confirmation: boolean; // 是否需要用户确认
}
```

### ProposedChange 结构

```typescript
interface ProposedChange {
  asset_type: "character" | "relationship" | "event" | "world_fact";
  asset_id: string;           // 稳定 asset id
  asset_version: string;      // 版本 hash，用于冲突检测
  field_path: string;         // 字段级路径，如 "personality.traits"
  current_value: any;         // 当前值
  proposed_value: any;        // 建议值
  confidence: number;         // 置信度 0-1
  reason: string;             // 变更原因
  evidence_refs: string[];    // 证据引用
  risk_level: "low" | "medium" | "high";
}
```

### Conflict 结构

```typescript
interface Conflict {
  conflict_id: string;
  asset_type: string;
  asset_ids: string[];        // 冲突的资产 id
  conflict_type: "inconsistent_description" | "contradictory_traits" | "timeline_mismatch";
  description: string;
  resolution: string;         // 解决方案
  confidence: number;
}
```

---

## 4. 预算策略

### Job-Level 总预算

```python
class DeepSynthesisBudget:
    max_model_calls: int = 10      # 最大模型调用次数
    max_tokens: int = 50000        # 最大 token 数
    max_rounds: int = 2            # 最大轮次（默认 1 轮，最多 2 轮）
    max_wall_clock_seconds: int = 600  # 最大墙钟时间
    quality_delta_threshold: float = 0.05  # 质量提升阈值
```

### Round-Level 子预算

每轮通过 `BudgetedScheduler` 申请预算：

```
Round 1: 生成候选（first_pass phase）
Round 2: 补缺/验证（repair phase，仅在 Round 1 有收益时触发）
Round 3: 仅在高优先级冲突仍未解决且前一轮有明确收益时允许（retry phase）
```

### 预算档位

| 档位 | max_model_calls | max_tokens | max_rounds |
|------|----------------|------------|------------|
| low  | 5              | 20000      | 1          |
| medium | 10           | 50000      | 2          |
| high | 20             | 100000     | 3          |

### 收敛检测（停止条件）

任一条件满足即停止：

```python
def should_stop(round_index, quality_delta, proposed_changes, high_confidence_changes,
                unresolved_conflicts, user_acceptance_rate, budget_state):
    return (
        round_index >= max_rounds or
        budget_state.remaining_model_calls < 2 or
        quality_delta < quality_delta_threshold or
        len(proposed_changes) == 0 or
        high_confidence_changes == 0 or
        (round_index > 0 and unresolved_conflicts not decreased) or
        (round_index > 0 and user_acceptance_rate < 0.2)
    )
```

---

## 5. 失败恢复

### 技术失败（可重试）

```
- provider timeout
- rate limited
- gateway error
- JSON 解析失败（经 schema repair 后仍失败）
```

→ 走 `RetryQueue`，指数退避 + jitter

### 业务失败（不可重试）

```
- convergence plateau（质量无提升）
- insufficient evidence（证据不足）
- user rejected（用户拒绝）
- budget exhausted（预算耗尽）
- no actionable changes（无可用变更）
```

→ 返回结果，不重试

### Schema 失败

```
- JSON 格式错误 → 有限 schema repair（最多 2 次）
- 字段缺失 → 记录 warning，跳过该变更
- 类型错误 → 记录 error，标记为 failed
```

---

## 6. AttemptStore 记录

### 新增字段

```python
class DeepSynthesisAttemptRecord:
    # 基础字段（复用 AttemptRecord）
    id: str
    task_type: str = "deep_synthesis"
    status: str  # pending/running/success/failed/cancelled
    created_at: datetime
    updated_at: datetime

    # Synthesis 专属字段
    scope_type: str  # "character" | "relationship" | "event" | "world_fact" | "full"
    scope_ids_hash: str  # scope 内资产 id 的 hash
    round_index: int  # 当前轮次
    pass_type: str  # "generation" | "validation" | "conflict_resolution"
    model_role: str  # "extractor_deep" | "synthesizer_deep"
    model_name: str

    # 质量指标
    quality_before: float  # 综合前质量分数
    quality_after_preview: float  # preview 质量分数
    proposed_change_count: int
    accepted_change_count: int
    high_confidence_change_count: int
    unresolved_conflict_count: int
    convergence_reason: str  # "round_limit" | "quality_plateau" | "budget_exhausted" | "no_changes"

    # 技术指标
    latency_ms: int
    token_estimate: int
    schema_repair_count: int
    error_code: Optional[str]
    retry_queue_id: Optional[str]

    # 用户反馈
    user_acceptance_rate: Optional[float]  # 用户采纳率
    user_feedback: Optional[str]  # 用户反馈
```

---

## 7. RetryQueue 关系

### 可重试场景

```python
RETRYABLE_DEEP_SYNTHESIS_ERRORS = {
    "rate_limited",
    "gateway_timeout",
    "timeout",
    "provider_unavailable",
    "json_invalid",  # 经 schema repair 后仍失败
}
```

### 不可重试场景

```python
NON_RETRYABLE_DEEP_SYNTHESIS_ERRORS = {
    "convergence_plateau",
    "insufficient_evidence",
    "user_rejected",
    "budget_exhausted",
    "no_actionable_changes",
    "conflict_unresolvable",
}
```

### RetryJob Payload

```python
class DeepSynthesisRetryJob:
    # 只存结构化数据，不存真实正文
    scope_type: str
    scope_ids: List[str]  # 资产 id 列表
    asset_versions: Dict[str, str]  # asset_id -> version hash
    round_index: int
    budget_snapshot: Dict[str, int]  # 剩余预算
    router_profile: Dict[str, Any]  # 路由决策快照
    error_code: str
    error_message: str  # 截断到 500 字符
```

---

## 8. PerformanceProfile / ModelRouter 使用

### 模型角色

**短期**：复用 `extractor_deep` 角色
- 配置：timeout=420s, concurrency=1, chunk_size=1800, max_tokens=4000
- 走 `ModelRouter.select_model("extractor_deep")`
- 走 `PerformanceProfile` 聚合

**中期**（如 metrics 显示差异明显）：新增逻辑角色
- `synthesizer_deep`：综合生成
- `synthesis_judge`：质量评估
- 仍走同一个 ModelRouter/PerformanceProfile 机制

### 路由决策

```python
async def select_synthesis_model(role: str, scope_type: str, session_id: str):
    # 1. ModelRouter 选择候选
    decision = await model_router.select_model(
        role=role,
        probe=True,
        session_id=session_id,
    )

    # 2. PerformanceProfile 排序（如果启用）
    if config.enable_profile_routing:
        # 使用 profile ranking
        pass

    # 3. 记录路由决策到 AttemptStore
    return decision
```

---

## 9. 前端确认流程

### Preview-Then-Apply 模式

```
用户选择 synthesis scope + 预算档位
        ↓
后端生成 preview（不写库）
        ↓
前端展示 preview diff：
  - 冲突解决说明
  - 关系补全建议
  - 世界观一致性检查
  - 人物设定合并
  - 风险标记
        ↓
用户操作：
  - 全选接受
  - 分组选择
  - 逐项选择
  - 拒绝全部
        ↓
后端 apply 已确认的 patch
        ↓
记录 accepted/rejected 反馈到 AttemptStore/PerformanceProfile
```

### UI 组件

```tsx
// DeepSynthesisPreview 组件
interface DeepSynthesisPreviewProps {
  preview: DeepSynthesisPreview;
  onAccept: (changeIds: string[]) => void;
  onReject: (changeIds: string[]) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

// 展示内容
- 综合摘要
- 变更列表（按资产类型分组）
- 冲突解决说明
- 新发现的关系
- 风险标记
- 置信度变化
- 应用计划
```

---

## 10. 安全边界

### 禁止行为

```
- 读取或持久化真实小说正文
- 把用户原文写入 retry job、AttemptStore、诊断日志或 profile
- 让 Deep Synthesis 绕过 BudgetedScheduler / AttemptStore / ModelRouter
- 在 convergence 检测中使用模型自我声明
- 把 apply 做成整段覆盖资产（必须使用 asset id + version/hash + field-level patch）
```

### 脱敏规则

```
- evidence labels 截断到 200 字符
- error_message 截断到 500 字符
- 不存储 raw_response_text / raw_response_preview
- 不存储 provider 原始错误长 body
```

---

## 11. 实现计划

### Phase G.1：基础框架（1-2 天）

1. 新增 `deep_synthesis` 任务类型
2. 定义 `DeepSynthesisPreview` schema
3. 实现 `DeepSynthesisService` 基础框架
4. 接入 `BudgetedScheduler`、`AttemptStore`、`RetryQueue`
5. 实现基础 preview-then-apply 流程

### Phase G.2：多轮收敛（1 天）

1. 实现收敛检测逻辑
2. 实现 round-level 预算管理
3. 实现质量评分变化追踪
4. 实现用户采纳率反馈

### Phase G.3：前端集成（1 天）

1. 扩展前端类型
2. 实现 DeepSynthesisPreview 组件
3. 集成到 extract 页面
4. 添加预算档位选择

### Phase G.4：测试与优化（1 天）

1. 单元测试
2. 集成测试
3. 性能优化
4. 文档更新

---

## 12. 验收标准

- [ ] Deep Synthesis 不绕过 BudgetedScheduler / AttemptStore / ModelRouter
- [ ] Deep Synthesis 不使用真实 provider 调用
- [ ] Deep Synthesis 不使用真实小说文本
- [ ] Deep Synthesis 不修改 AIService / rate_limiter / concurrency
- [ ] 输出为 preview patch，不是直接写库
- [ ] 用户确认后才 apply
- [ ] 收敛检测使用结构化指标，不是模型自我声明
- [ ] AttemptStore 记录 synthesis 专属字段
- [ ] RetryQueue 只重试技术失败
- [ ] 前端能展示 preview diff
- [ ] 前端能选择接受/拒绝
- [ ] 测试通过
- [ ] 文档更新
