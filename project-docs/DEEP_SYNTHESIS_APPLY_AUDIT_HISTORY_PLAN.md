# Deep Synthesis Apply Audit & History Plan

> 状态：**Planning**
> 日期：2026-06-17
> 关联阶段：Phase H.4

---

## 1. Problem Statement

Deep Synthesis MVP 已完成（Phase G.4.4），apply 流程端到端验证通过（Phase H.2/H.3）。但当前系统缺乏以下能力：

1. **审计不可见**：apply 操作记录保存在 AttemptStore 中，但前端无法按 `task_type` 过滤查看。
2. **历史不可追溯**：用户无法查看"谁在什么时间对哪个资产做了哪些字段变更"。
3. **回滚不可行**：apply 是单向写入，无 undo 机制（by design，但需要审计能力补偿）。

目标：为 Deep Synthesis apply 操作建立可查询、可审计的历史记录，作为后续回滚或手动修复的前提。

---

## 2. Current State Audit

### 2.1 `record_apply_attempt()` 记录内容

| 字段 | 值 | 说明 |
|------|------|------|
| `task_type` | `"deep_synthesis_apply"` | 区分于 `"deep_synthesis"` (preview) 和 `"chapter_index"` (提取) |
| `session_id` | request.session_id | 项目/会话标识 |
| `chapter_id` | SHA256(session_id)[:20] | 复用字段，无实际章节含义 |
| `chapter_title` | `"deep_synthesis_apply"` | 固定值 |
| `status` | `"success"` / `"failed"` | 基于 result.status 映射 |
| `latency_ms` | int | 操作耗时 |
| `error_type` | Optional[str] | 非 success/dry_run 时记录 |
| `parsed_candidate_counts` | `{accepted_count, rejected_count, applied_count, skipped_count, conflict_count, dry_run}` | 结构化计数 |
| `budget_summary` | dict | 包含 task_type, counts, user_acceptance_rate, status, error_type；如有 idempotency_key 还包含 key + fingerprint + result snapshot |
| `proposed_change_count` | int | preview 中 proposed_changes 总数 |
| `unresolved_conflict_count` | int | apply 结果中的 conflict_count |
| `convergence_reason` | str | 复用为 result.status（语义过载） |
| `user_acceptance_rate` | float / None | accepted / (accepted + rejected) |
| `scope_type` | `"apply"` | 固定值 |
| `quality_before` | None | apply 记录不记录质量分数 |
| `quality_after_preview` | None | 同上 |

### 2.2 AttemptStore 查询能力

| 方法 | 筛选 | 排序 | 限制 |
|------|------|------|------|
| `list_by_session(session_id)` | session_id | (chapter_order, attempt_number) | 全量返回 |
| `list_by_chapter(chapter_id, session_id?)` | chapter_id + optional session_id | attempt_number | 全量返回 |
| `get(attempt_id)` | id 精确匹配 | — | 单条 |
| `stats(session_id?)` | session_id? | — | 聚合统计 |

**缺失**：
- 无 `task_type` 筛选
- 无时间范围筛选
- 无分页支持（全量加载后内存截断）

### 2.3 现有 API 端点

| 端点 | 功能 | task_type 筛选 |
|------|------|----------------|
| `GET /api/extraction/attempts?session_id=` | 列出所有 attempt | ❌ 无 |
| `GET /api/extraction/attempts/{id}?session_id=` | 单条详情 | N/A |
| `GET /api/extraction/attempts/summary?session_id=` | 聚合统计 | ❌ 混合所有 task_type |

**结论**：现有 API 能返回 deep_synthesis_apply 记录，但无法与 chapter_index 记录区分。

### 2.4 数据安全现状

- ✅ `raw_response_preview` / `raw_response_hash` 在 persist 时被剔除（deep_synthesis* 专用）
- ✅ `FORBIDDEN_INPUT_FIELDS` 阻止 chapter_content 等进入输入
- ✅ `budget_summary` 中的 idempotency result snapshot 不含 forbidden fields
- ✅ API response 中 `raw_response_preview` 截断至 100 字符
- ⚠️ `budget_summary` dict 是自由结构，可能包含 idempotency request_fingerprint（SHA256 hash，非敏感）

---

## 3. Minimal Audit Data Model

不新增 AttemptRecord 字段。复用现有字段存储 apply 审计信息：

```
AttemptRecord (existing)
├── id: str                          # apply attempt ID
├── task_type: "deep_synthesis_apply"
├── session_id: str                  # project/session scope
├── created_at: ISO timestamp
├── status: "success" | "failed"
├── latency_ms: int
├── parsed_candidate_counts:
│   ├── accepted_count: int
│   ├── rejected_count: int
│   ├── applied_count: int
│   ├── skipped_count: int
│   ├── conflict_count: int
│   └── dry_run: 0 | 1
├── budget_summary:
│   ├── user_acceptance_rate: float?
│   ├── status: str (result.status)
│   └── idempotency?: {key, fingerprint, result_snapshot}
├── proposed_change_count: int
├── unresolved_conflict_count: int
├── user_acceptance_rate: float?
└── convergence_reason: str (= result.status)
```

**不在 AttemptRecord 中存储**：
- applied_changes 列表（含 field_path / previous_value / applied_value）
- skipped_changes 列表
- conflicts 列表
- 原始 request / preview 数据

**原因**：这些数据体积大，且已通过 idempotency result snapshot 有条件保存。详细变更历史应由独立审计日志承担（未来阶段）。

---

## 4. Data Safety Rules

### 禁止在审计记录中出现的字段

| 字段 | 原因 |
|------|------|
| `chapter_content` | 真实小说正文 |
| `raw_response_text` | 模型原始响应 |
| `raw_response_preview` | 模型响应预览 |
| `provider_error_body` | Provider 错误详情 |
| `full_text` | 完整文本 |
| `original_text` | 原始文本 |

### 审计记录安全约束

1. **输入侧**：`_validate_apply_request()` 已递归拒绝 forbidden fields（✅ 已实现）
2. **持久化侧**：`AttemptStore.record()` 已剔除 `raw_response_preview` / `raw_response_hash`（✅ 已实现）
3. **输出侧**：API response 中 `raw_response_preview` 截断至 100 字符（✅ 已实现）
4. **新增约束**：list/detail API 不返回 `budget_summary` 中的 `idempotency.result` 完整快照，仅返回摘要字段

---

## 5. Proposed Backend API

### 5.1 增强现有 list endpoint

**修改**：`GET /api/extraction/attempts`

新增 query 参数：
- `task_type: Optional[str]` — 筛选 task_type（如 `"deep_synthesis_apply"`、`"deep_synthesis"`、`"chapter_index"`）
- `since: Optional[str]` — ISO timestamp，只返回 created_at >= since 的记录
- `until: Optional[str]` — ISO timestamp，只返回 created_at <= until 的记录

不新增独立端点，复用现有 `/api/extraction/attempts` 并扩展筛选能力。

### 5.2 增强现有 detail endpoint

**修改**：`GET /api/extraction/attempts/{attempt_id}`

对 `deep_synthesis_apply` 记录：
- 从 `budget_summary` 中提取并展平关键字段到顶层（`applied_count`、`skipped_count`、`conflict_count`、`user_acceptance_rate`）
- 不返回 `budget_summary.idempotency.result` 完整快照
- 保持向后兼容：非 deep_synthesis_apply 记录行为不变

### 5.3 新增 summary 筛选

**修改**：`GET /api/extraction/attempts/summary`

新增 query 参数：
- `task_type: Optional[str]` — 只统计指定 task_type 的记录

---

## 6. Proposed Frontend UX（不实现，仅规划）

### 6.1 Apply History 区块

在 Extract 页面 Deep Synthesis Preview 区块下方新增 "Apply History" 可折叠区块：

- **触发条件**：session_id 存在且有 deep_synthesis_apply 记录
- **数据源**：`GET /api/extraction/attempts?session_id=X&task_type=deep_synthesis_apply`
- **展示内容**：
  - 时间线视图：每次 apply 操作的时间、状态、统计
  - 状态徽章：success（绿）、partial（黄）、failed（红）、dry_run（蓝）
  - 摘要卡片：applied_count / skipped_count / conflict_count / user_acceptance_rate
  - 点击展开详情：显示 applied_changes 摘要（asset_id + field_path + version before→after）
- **不展示**：raw response、forbidden fields、完整 previous/applied value（截断至 200 字符）

### 6.2 Diff View（未来）

- 对比两次 apply 之间同一 asset 的字段变化
- 需要独立的 asset version history 机制（不在本次范围内）

---

## 7. Recommended Implementation Phases

### Phase H.4.1：Backend task_type Filter（最小可行）

**范围**：
- `AttemptStore` 新增 `list_by_session_and_task_type()` 方法
- `GET /api/extraction/attempts` 新增 `task_type` query 参数
- `GET /api/extraction/attempts/summary` 新增 `task_type` query 参数
- API 测试覆盖

**预计改动**：
- `attempt_store.py`：新增 1 个方法
- `api/__init__.py`：修改 2 个 endpoint
- 测试：新增 4-6 个测试

**依赖**：无

### Phase H.5：Frontend Apply History 面板

**范围**：
- 前端 API client 新增 `listDeepSynthesisApplyAttempts(sessionId)`
- 新增 `DeepSynthesisApplyHistory` 组件
- 集成到 Extract 页面
- 工具函数和测试

**预计改动**：
- `novelforge-api.ts`：新增 API client 方法
- `deep-synthesis-utils.ts`：新增 apply history 格式化函数
- `deep-synthesis-apply-history.tsx`：新组件
- `page.tsx`：集成
- 测试

**依赖**：H.4.1

### Phase H.6：Apply Detail 扩展

**范围**：
- `GET /api/extraction/attempts/{id}` 对 deep_synthesis_apply 记录展平关键字段
- 前端详情展开视图
- 冲突和跳过原因的中文翻译

**依赖**：H.5

### Phase H.7：Asset Version History（远期）

**范围**：
- 独立的 asset field-level change log（不复用 AttemptRecord）
- 支持 diff view 和 rollback 候选
- 需要新的存储结构

**依赖**：H.6 + 架构决策

---

## 8. Open Questions

1. **`budget_summary` 中的 idempotency result snapshot 是否需要保留？**
   - 当前保存完整的 `DeepSynthesisApplyResult` 快照（含 applied_changes 列表）
   - 如果需要审计详细变更，这是唯一来源
   - 如果体积过大，可以只保留 summary + attempt_id
   - **建议**：保留，但 API 输出时不返回完整快照

2. **`convergence_reason` 语义过载问题**：
   - preview 记录中表示收敛原因（如 `round_limit`、`quality_plateau`）
   - apply 记录中被赋值为 `result.status`（如 `success`、`partial`）
   - **建议**：不改，向后兼容；未来通过 `task_type` 区分语义

3. **是否需要独立的 apply audit log 表？**
   - 当前复用 AttemptRecord，字段足够存储摘要
   - 详细变更历史（field_path / previous / applied）仅通过 idempotency snapshot 有条件保存
   - **建议**：H.4.1 + H.5 先用 AttemptRecord；H.7 再评估是否需要独立结构

4. **前端 apply history 是否需要支持"撤销"操作？**
   - 当前 apply 是单向写入，无 undo
   - 可以展示"建议手动回滚"提示，但不自动执行
   - **建议**：H.5 只做展示，不做 undo

---

## 9. Decision

### 推荐先做 H.4.1（Backend task_type Filter）

**理由**：
1. **改动最小**：仅修改 AttemptStore + 2 个 API endpoint + 测试
2. **无前端依赖**：纯后端，不影响前端构建
3. **解锁 H.5**：前端 Apply History 面板需要 task_type 筛选能力
4. **立即可用**：即使不做前端，API 消费者（如 CLI、调试工具）也能按 task_type 查询
5. **风险极低**：新增可选 query 参数，向后兼容

### 不先做 H.5 的理由

H.5 依赖 H.4.1 的 task_type 筛选。没有筛选能力时，前端需要全量加载所有 attempt 记录再内存过滤，不高效且不优雅。
