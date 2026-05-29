# NovelForge 提取模型与网关策略复盘

日期：2026-05-29

## 当前结论

Goal 21 暴露出的核心问题已经不是单纯“换一个模型名”能解决的。当前提取链路过度依赖单一模型在单次请求中完成结构化理解，一旦 NewAPI 网关在某个时段出现慢响应、空响应、504、429、模型路由变化或 JSON 不稳定，整本长篇导入就会从“可用”退回到 `partial` 或 `low_quality`。

关系端点归一本身已经有明显进展：上一轮 `帝` 这类短端点导致未闭合；本轮在部分真实 smoke 中已做到 `relationship_unresolved_endpoints=[]`、`relationship_endpoint_mapping_ratio=1.0`。但项目仍不能进入内部可用，因为章节级抽取覆盖率被模型/网关稳定性拖垮。

因此下一阶段重点应从“指定某个模型跑完”升级为“可观测、可测速、可切换、可恢复的模型编排系统”。

## 本轮事实记录

Goal 20 基线：

- `chapters=10`
- `characters=15`
- `relationships=15`
- `timeline=30`
- `world=1`
- `analysis_status=low_quality`
- 主要质量问题：关系端点 `帝` 未映射到角色池。

Goal 21 已完成的工程修复：

- 增强章节级关系端点归一：
  - 完整姓名匹配
  - tags / aliases / extracted_data.aliases 匹配
  - 称谓剥离
  - 有证据、唯一候选时的中文单字简称匹配
  - 多候选或低证据时保留 unresolved
- 增加端点审计字段：
  - `match_type`
  - `confidence`
  - `matched_character_id`
  - `matched_character_name`
  - `evidence`
  - `needs_review`
- 前端导入诊断增加：
  - 关系端点已自动归一
  - 低置信关系需要复核
  - 仍有未闭合端点
- 修复 AI 请求限流器并发竞态，避免并发协程同时越过 RPM 检查。
- 章节 index 增加可配置并发与输出 token 上限。
- 长章切分阈值收紧，降低单次请求体积。

Goal 21 真实复验结果：

| 时间/模型策略 | 结果 | 关键指标 | 结论 |
| --- | --- | --- | --- |
| `gemini-3.5-flash` | `/models` 可列出，但 chat 返回空 content 或 provider 失败 | 章节级抽取不可用 | 不适合当前提取主链路 |
| `deepseek-ai/deepseek-v4-pro` | 完整 smoke 成功返回，但仅 2/18 章节抽取成功 | `characters=6`, `relationships=5`, `timeline=4`, `status=partial`, `unresolved=0` | 端点闭合改善，但覆盖率不足 |
| `deepseek-ai/deepseek-v4-flash` | 完整 smoke 成功返回，但多数章节 504 | `characters=4-5`, `relationships=2-4`, `timeline=2-3`, `status=partial`, `unresolved=0` | 快速模型仍受网关超时影响 |
| `mimo-v2.5-pro` | 小样本速度较快，但结构化提取常返回空数组 | `characters=0`, `relationships=0`, `events=0` | 不适合作为章节提取主模型，可作为后续创作/改写候选再测 |
| 2500 字符切分 + 轻量 prompt | 40 分钟超时，未形成完整结果 | 日志出现 200 与 504 混杂 | 仅缩小 chunk 仍不足，需要可恢复任务与模型编排 |

## 当前问题清单

### 1. 模型可用性不是静态事实

同一个模型在 `/models` 中可见，不等于它在 `/chat/completions` 中稳定可用。真实表现可能包括：

- HTTP 200 但 `content=""`
- HTTP 503 无可用 channel
- HTTP 504 Gateway Time-out
- HTTP 429 Too Many Requests
- 返回解释性文字而不是 JSON
- 返回 JSON 但尾部截断或格式错误
- 短 prompt 可用，长 prompt 不可用

所以 `.env` 里写死 `OPENAI_MODEL=xxx` 只能解决启动问题，不能解决生产可用性。

### 2. 当前提取链路过度依赖模型一次性理解

现有章节级 index 已比全书 prompt 更合理，但仍要求模型对每个片段直接输出完整结构化资产。只要模型慢、格式差或网关波动，该章节就失败。

如果“回退”只是从文章里摘取一些句子并假装完成提取，那么 AI 的价值确实会被稀释。正确定位应是：

- 本地规则负责稳定的输入整理、候选召回、证据定位、章节切分、失败恢复。
- AI 负责语义判断、人物性格/欲望/创伤/关系张力/事件意义/世界观归类。
- 本地 fallback 只能作为低置信种子或诊断材料，不能计入 ready 质量，也不能冒充 AI 提取成果。

### 3. 长篇导入仍不是可恢复任务

目前完整 smoke 是“整本导入跑到底”。当中途大量章节 504 或命令超时时，结果要么 partial，要么根本没有最终 JSON。

产品级导入应该是：

- 每章/每段独立持久化 index 尝试结果。
- 成功段立即写入中间表或任务缓存。
- 失败段可批量重试。
- 第二轮只重跑失败段，不重复成功段。
- 最终 merge 可以多次执行。

这也是未来“用户修改某章后只重跑该章”的基础。

### 4. 请求限流需要按模型和错误动态调整

本轮修复了本地 RateLimiter 并发竞态，但这只是底层保证。还需要上层策略：

- 429：降低并发和 RPM，等待冷却。
- 504：切模型或缩短 chunk，不应立刻对同模型重复轰炸。
- 空 content：将模型标记为当前任务不合格。
- JSON 错误：可以先做一次同模型轻量修复或切到 JSON 合规性更好的模型。
- 多次失败：进入 circuit breaker 冷却，而不是继续占用全书任务。

### 5. 速度快的模型不一定适合提取

`mimo-v2.5-pro` 的响应速度较好，但在章节 index 小样本中返回空数组。它可能更适合创作、润色、改写，而不是严格结构化提取。

模型应按“任务角色”评估，而不是按名字或速度粗暴选择：

- `extractor_fast`：结构化 JSON 合规、低延迟、可批量。
- `extractor_repair`：能修复 JSON、补证据、处理失败章节。
- `extractor_deep`：慢但语义强，用于主角/关系/世界观深度补强。
- `writer_fast`：快速生成候选段落。
- `writer_pro`：高质量序章、风格化、情绪张力。
- `judge`：质量验收、错配检查、关系张力评分。

## 建议的新架构

### A. 模型注册与实时测速

增加 `ModelRegistry` / `ModelRouter`，不把业务逻辑绑定到固定模型名。

管理员配置只保存候选池：

```json
{
  "extractor_fast": ["gemini-3.5-flash", "deepseek-ai/deepseek-v4-flash", "mimo-v2.5-pro"],
  "extractor_deep": ["gemini-3.1-pro-preview", "deepseek-ai/deepseek-v4-pro"],
  "writer_fast": ["mimo-v2.5-pro", "deepseek-ai/deepseek-v4-flash"],
  "writer_pro": ["gemini-3.1-pro-preview", "deepseek-ai/deepseek-v4-pro"]
}
```

系统启动或任务开始前做轻量测速：

- `/models` 可见性
- 短 chat 是否有非空 content
- JSON prompt 是否能返回可解析 JSON
- 小片段是否能提取非空候选
- 延迟 p50/p95
- 429/5xx 率

测速结果只影响当前时段路由，不写死代码。

### B. 任务级模型编排

导入一本文本时不要只选一个模型：

1. 本地预处理：
   - 编码识别
   - 章节解析
   - 小段切分
   - 关键词/人名候选粗召回
   - 证据片段定位
2. 快速模型批量抽取：
   - 小段结构化 index
   - 严格 JSON schema
   - 失败段直接记录
3. 失败段修复：
   - 换模型
   - 缩短文本
   - 降低输出字段
   - JSON 修复
4. 深度模型补强：
   - 核心角色档案
   - 关系张力
   - 世界观规则/历史
5. Merge + quality gate：
   - 只把有证据资产写入内容库
   - 低置信资产标记 `needs_review`
   - 不达标保持 `low_quality` 或 `partial`

### C. 可恢复的章节 index 存储

需要新增中间结果存储，不再依赖一次任务内存：

- `chapter_index_attempts`
- `chapter_index_status`
- `model_used`
- `latency_ms`
- `error_type`
- `raw_response_hash`
- `parsed_candidate_counts`
- `retry_count`
- `needs_retry`

这样 UI 才能真实显示：

- 哪些章节成功
- 哪些章节失败
- 失败原因是 504、JSON、空内容还是模型不合格
- 下一轮应该重跑哪些章节

### D. 本地 fallback 的边界

本地 fallback 可以做：

- 保证章节和正文不丢。
- 给失败章节生成低置信 `diagnostic_seed`。
- 提供可复跑证据片段。
- 帮助 UI 告诉用户“这章没真正 AI 理解，只是保留了候选线索”。

本地 fallback 不应该做：

- 冒充完整角色档案。
- 冒充关系张力。
- 冒充世界观理解。
- 让项目状态从 `low_quality` 升到 `ready`。

换句话说，fallback 是抗故障，不是替代 AI。

## 下一阶段实施计划

### P0：停止单模型长篇硬跑

- 保留当前关系端点归一修复。
- 保留 RateLimiter 锁。
- 保留前端低置信关系诊断展示。
- 不再把单次 smoke 失败解释成“提取器失败”或“模型不可用”，而是记录具体网关/模型行为。

### P1：实现 ModelRouter v1

- 新增模型候选池配置。
- 增加 `model_probe`：
  - 短文本非空响应
  - JSON 合规
  - 小片段非空提取
  - latency
- 为章节提取选择当前最优模型。
- 对空 content、504、429 设置短期冷却。

#### 2026-05-29 进展

P1 已完成第一版代码落地：

- 新增 `novelforge.services.model_router.ModelRouter`。
- 新增运行时模型池配置：
  - `NOVELFORGE_EXTRACTOR_FAST_MODELS`
  - `NOVELFORGE_EXTRACTOR_DEEP_MODELS`
  - `NOVELFORGE_EXTRACTOR_REPAIR_MODELS`
  - `NOVELFORGE_WRITER_FAST_MODELS`
  - `NOVELFORGE_WRITER_PRO_MODELS`
  - `NOVELFORGE_JUDGE_MODELS`
- 新增探测参数：
  - `NOVELFORGE_ENABLE_MODEL_ROUTER`
  - `NOVELFORGE_MODEL_PROBE_TIMEOUT`
  - `NOVELFORGE_MODEL_COOLDOWN_SECONDS`
- `ModelRouter` 当前支持：
  - 按任务角色读取候选池。
  - 对 extractor 角色做非空响应、JSON 可解析、提取信号非空检查。
  - 对 writer 等非 extractor 角色做非空响应检查。
  - 对 `429 / 5xx / 504 / empty_content / auth_failed / json_invalid` 做错误归类。
  - 对不合格模型设置短期冷却。
  - 将路由决策写入章节 index 的 `analysis_diagnostics.model_route`。
- `ExtractionService.extract_chapter_index_assets(...)` 已在任务开始前为章节 index 选择一次模型，不在每章重复测速。

当前边界：

- 这还不是完整的多模型流水线；只完成了模型路由入口。
- 路由结果仍是内存态，没有持久化为长期模型健康历史。
- 尚未实现失败章节的持久化 attempt 与增量重跑。
- 尚未为 UI 展示模型路由报告。

### P2：实现可恢复章节 index

- 每个章节/片段独立保存 attempt。
- 失败章节可重试。
- 完整导入任务允许先结束为 `partial`，并提供“继续重跑失败章节”入口。
- merge 可以读取多轮成功结果。

#### 2026-05-29 进展

P2 已完成第一步“attempt 可观测化”，先把失败章节从一个笼统的 `failed_chapters` 升级为可诊断的逐章/逐次记录：

- `ImportAnalysisDiagnostics` 新增：
  - `chapter_index_attempts`
  - `chapter_index_status`
- 每次章节 index 模型调用会记录：
  - `chapter_id / chapter_title / chapter_order`
  - `attempt_number`
  - `status`
  - `model_used`
  - `latency_ms`
  - `error_type`
  - `raw_response_hash`
  - `raw_response_chars`
  - `parsed_candidate_counts`
  - `retry_count`
  - `needs_retry`
- 错误会归类为：
  - `rate_limited`
  - `auth_failed`
  - `gateway_timeout`
  - `provider_unavailable`
  - `json_invalid`
  - `timeout`
  - `empty_content`
- `ExtractionService.extract_chapter_index_assets(...)`、导入深度分析结果、章节修复 preview 结果都会透传这些字段。
- `candidate_counts` 会补充：
  - `chapter_index_attempts`
  - `chapter_index_failed_attempts`
  - `chapter_index_needs_retry`

当前边界：

- attempt 目前随导入任务结果持久化，尚未拆成独立数据库表。
- 任务中途进程崩溃时，已完成章节的 attempt 仍可能来不及落库。
- 下一步应把成功/失败 attempt 在每章结束后立即写入可查询存储，并让 rerun 默认只选择 `needs_retry=true` 的章节。

### P3：多模型提取流水线

- 快速模型做广覆盖。
- 深度模型只补核心角色、主线关系和世界观。
- JSON 修复任务使用最擅长格式修复的模型。
- 写作模型与提取模型分开评估。

### P4：真实验收标准调整

新的 smoke 报告必须包含：

- 使用了哪些模型
- 每个模型成功率
- 每个模型平均延迟
- 每类错误数量
- 成功章节数 / 总章节数
- 重试后成功章节数
- 关系端点 resolved / unresolved / low_confidence_resolved
- quality gate 结果

如果模型网关波动导致未达标，报告应该显示“可恢复到哪一步”，而不是只给一个失败状态。

## 当前项目状态判断

当前 NovelForge 不能称为内部可用。更准确的状态是：

- 章节解析和资产落库基础链路可用。
- 关系端点归一能力明显增强。
- 质量诊断比 Goal 20 更可解释。
- 但长篇结构化提取仍受模型网关稳定性和单模型依赖影响，无法稳定达到 `ready`。

下一轮不应继续堆 UI 或写作功能，也不应继续盲目换模型重跑。应先实现模型测速、模型路由和可恢复章节 index。否则每次更换 API 网关或模型供应商，项目都会重新变得不可用。
