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
- 章节级修复任务已支持根据上一轮诊断缩小重跑范围：
  - `chapter_index_status[].needs_retry=true`
  - `chapter_index_status[].status=failed`
  - `failed_chapters[].chapter_id`
  - 显式 `chapter_ids`
- 章节 index 提取器新增 `diagnostics_recorder` 回调。
- 导入任务 / 修复 preview 任务会创建 `chapter_index_run_<task_id>` 存储记录，并在每次 attempt / 每章 status 完成后立即写入：
  - 这让任务中途崩溃时，已完成章节的 attempt 诊断不再完全依赖最终 result。
  - 最终 `analysis_diagnostics.chapter_index_run_key` 会指向该记录。
- 成功章节 `ChapterIndex` 快照会进入同一个 run 记录：
  - `chapter_indices`
  - 按 `chapter_id` 去重，后写入的重跑结果覆盖旧结果。
- 章节修复 preview 支持读取上一轮 `chapter_index_run_key`：
  - 先加载历史成功 `ChapterIndex`。
  - 再合并本轮重跑成功 `ChapterIndex`。
  - 最后基于组合后的章节索引重新 merge 角色、关系、时间线和世界观 preview。
  - 诊断中会记录 `chapter_index_history_run_key` 与 `chapter_index_history_reused_chapters`。
- 前端提取页已接入失败章节重跑诊断：
  - `ImportAnalysisDiagnostics` 类型支持 `chapter_index_attempts / chapter_index_status / chapter_index_run_key`。
  - “重跑章节索引”在未手动选择单章时，会把 `needs_retry` 章节、失败章节和 run key 提交给后端。
  - 后端会基于这些字段缩小重跑范围，避免再次对整本书发起无差别提取。
- UI 已显示历史复用状态：
  - Extract 统计区会识别 `chapter_index_history_reused / chapter_index_combined_indices`。
  - TaskCenter 修复 preview 摘要会显示“复用历史成功章 N 章，合并索引 M 章”。
  - TaskCenter 修复 preview 可展开单章明细，显示：
    - 已复用的历史成功章节
    - 仍需重跑的章节及错误类型

当前边界：

- attempt 目前写入统一 StorageManager key，尚未拆成正式数据库表。
- 多轮合并已覆盖修复 preview；正式导入主任务仍以当前任务结果为主。
- `chapter_index_run_*` 已补独立查询 API，可按 `session_id / parent_id` 边界查询单个 run 或当前项目 run 列表：
  - `GET /api/extraction/chapter-index-runs?session_id=...&parent_id=...`
  - `GET /api/extraction/chapter-index-runs/{run_key}?session_id=...&parent_id=...&include_indices=true`
  - 默认返回 attempt/status/章节索引摘要；需要完整 `chapter_indices` 时显式传 `include_indices=true`。
- Extract 页已能展示最近 run，并可从某个 run 的失败/需重跑章节直接提交 `chapter_index_rerun` preview 任务：
  - payload 携带 `chapter_index_run_key`、失败章 `chapter_index_status`、`failed_chapters` 与精确 `chapter_ids`。
  - 后端会复用历史成功 `ChapterIndex`，只重跑失败章，再合并 preview。
- 下一步仍应把该 run 结构从通用 StorageManager key 升级为正式数据库中间表，以便支持分页、长期保留、模型健康统计和更高效的项目级查询。

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

## 2026-06-01 暂停功能堆叠后的问题复盘

### 为什么这不是简单的 API 地址或模型名问题

这次网关切换暴露的是系统性问题，而不是单点配置问题：

- 有些模型慢，但不是不可用；如果只按固定 timeout 或一次失败判定不可用，会误杀可用的慢模型。
- 有些模型快，但结构化抽取能力弱；如果只按速度选择，会得到空数组、浅层摘要或不稳定 JSON。
- 同一模型在不同时段、不同上游 channel、不同请求长度下表现会变化；静态 `.env` 模型名不能代表当前真实可用能力。
- `/models` 可见只能说明网关暴露了模型名，不能说明它能稳定完成长文本结构化提取。
- 网关可承载 30 RPM 以内请求，不代表所有模型都适合并发；并发策略必须按模型、错误类型和任务角色动态调整。

因此，NovelForge 不能再把“换一个可用模型名”当作稳定方案。模型选择必须从配置项升级为运行时策略。

### AI 引入的真实价值边界

用户指出的关键问题是成立的：如果系统完全依赖模型原样抽取，失败后又只从原文摘几句作为 fallback，那么 AI 的价值会变得不清晰，甚至会让用户误以为系统已经理解了小说。

NovelForge 中 AI 应该承担的价值不是“把原文重新搬运进数据库”，而是：

1. **语义压缩**：从长篇正文中提炼角色动机、欲望、创伤、目标、恐惧和转变。
2. **关系理解**：判断人物之间的依赖、误解、债务、权力差、情绪张力和叙事冲突。
3. **事件意义判断**：不仅识别发生了什么，还判断事件对角色弧光和世界观规则的影响。
4. **世界观归类**：把散落设定归入地点、组织、规则、历史、特殊概念，并保留证据。
5. **创作可用化**：把提取结果整理成 AI 写作时真正能调用的项目记忆，而不是只能展示的标签。
6. **写作增益**：在创作序章、续写、改写时使用这些资产生成有情绪张力和人物选择的文本。

本地规则和 fallback 的职责不同：

- 本地规则负责稳定性：编码、切章、分段、候选召回、证据定位、失败恢复。
- AI 负责理解性：性格、关系、冲突、情绪、事件意义、世界观逻辑。
- fallback 只能生成低置信诊断种子，不能冒充 AI 理解结果，也不能让项目进入 ready 状态。

如果 fallback 只是摘取原文，它必须在 UI 和 diagnostics 中被标记为 `diagnostic_seed` 或 `needs_ai_repair`，不能计入可写作资产质量。

### 当前现状判断

截至本复盘，项目已经具备以下基础：

- 章节级 index 主链路已替代旧全书 prompt 主路径。
- 导入结果能记录 `model_route`、`chapter_index_attempts`、`chapter_index_status`、`chapter_index_run_key`。
- 失败章节可以被识别，并支持基于 run key 的局部重跑 preview。
- 前端 Extract 页能看到模型路由和章节 index run 诊断。
- 关系端点归一、关系补强、写作 trace、editor 候选管理等产品闭环已有基础。

但仍未达到“内部测试可稳定使用”的关键原因是：

- 模型路由还是任务开始前的一次性选择，不是按章节/失败类型动态编排。
- 慢模型缺少长 timeout / 后台队列 / 小并发策略，容易被当成不可用。
- 快模型缺少结构化能力评分，可能速度快但提取为空。
- 多模型协作还没有形成流水线：快速覆盖、失败修复、深度补强、质量裁判仍未拆开。
- fallback 与 AI 结果的质量边界还需要更严格地暴露给 UI 和质量 gate。
- 缺少跨 run 的模型健康报告，不能回答“最近哪个模型在当前网关上最适合提取”。

因此，当前状态应定义为：**提取链路可观测性已明显提升，但模型编排还不够产品化；不能继续靠人工换模型名维持可用性。**

### 新的模型策略原则

后续模型选择不应固定为某个模型名称，而应按任务角色和实时表现决定：

| 任务角色 | 关注指标 | 推荐策略 |
| --- | --- | --- |
| `extractor_fast` | JSON 合规、非空候选、低延迟、稳定成功率 | 小 chunk、较高并发、失败快速切换 |
| `extractor_repair` | 能处理失败章、能修复 JSON、能补 evidence | 只处理失败章，不跑整本 |
| `extractor_deep` | 语义深度、人物关系张力、世界观归纳 | 低并发、长 timeout、只补核心资产 |
| `writer_fast` | 生成速度、可读性、中文表达 | 适合灵感、短段落、候选改写 |
| `writer_pro` | 情绪张力、审美、长文本一致性 | 适合正式序章和关键章节 |
| `judge` | 稳定评价、结构化评分 | 用于验收关系张力、错配、资产可写性 |

模型测速也不能只测“能不能回复一句话”，至少要分层：

1. **网关可达**：`/models` 或最小 chat 请求可达。
2. **非空回复**：短 prompt 返回可读内容。
3. **JSON 合规**：能按要求返回可解析 JSON。
4. **提取有效**：对小片段能返回非空角色/关系/事件/世界观候选。
5. **长片段耐受**：对目标 chunk 大小不空、不截断、不超时。
6. **质量评分**：是否包含 evidence、人物性格、关系张力、事件意义。
7. **成本和速度**：latency、429/504 率、平均 tokens、可承载并发。

### 慢模型的正确处理

慢模型不能简单被淘汰。正确处理方式是：

- 给慢但质量高的模型分配 `extractor_deep` / `writer_pro`，不要让它承担全书广覆盖。
- 对慢模型设置更长 timeout、更低并发、更小任务量。
- 快模型负责广覆盖和候选召回，慢模型只对核心角色、薄弱关系、失败章节做补强。
- 如果慢模型连续超时，进入 cooldown；cooldown 结束后可以重新测速，而不是永久禁用。
- smoke 报告必须区分“慢但最终成功”和“失败不可用”。

这能避免“换一个 API 或换一批 channel，系统又不可用”的反复。

### 下一轮最小落地任务

当前不建议继续新增 UI 或写作功能。下一轮应围绕模型编排收敛：

1. **最近模型健康报告**
   - 从 `chapter_index_run_*` 汇总最近 run。
   - 按模型展示：被选择次数、成功 attempt、失败 attempt、平均延迟、504/429/empty/json 错误数。
   - 在 Extract 页显示“当前网关模型健康”，让管理员知道不是盲目失败。

2. **慢模型策略配置**
   - 支持按角色设置 timeout、max_concurrency、chunk_size。
   - `extractor_deep` 默认低并发长 timeout。
   - `extractor_fast` 默认小 chunk 和快速失败切换。

3. **多模型章节失败修复**
   - 章节 index 首轮失败后，不重复同模型硬跑。
   - 按错误类型选择修复策略：
     - `empty_content`：切模型。
     - `json_invalid`：走 repair 模型或 JSON 修复 prompt。
     - `gateway_timeout`：缩短 chunk 或切低负载模型。
     - `rate_limited`：降低并发并冷却。

4. **fallback 质量边界硬化**
   - 本地 fallback 资产必须标记 `diagnostic_seed` / `needs_ai_repair`。
   - 不允许 fallback 资产让 `analysis_status=completed`。
   - UI 必须提示“此资产来自规则种子，尚未完成 AI 理解”。

5. **写作链路验证 AI 价值**
   - 每次序章生成 trace 必须记录使用了哪些角色、关系、世界观和章节证据。
   - 验收不只看文本通顺，还要看是否使用了关系张力、人物选择和世界观规则。

### 当前最重要的工程判断

NovelForge 的目标不是找一个“永远可用的模型名”，而是建立一个能适应网关波动和模型差异的创作系统。稳定可用的关键不是让 AI 替代所有规则，也不是让规则冒充 AI，而是把二者分层：

- 规则保证数据不丢、任务可恢复、证据可定位。
- AI 负责小说理解和创作增益。
- 模型路由负责根据实时健康选择合适模型。
- 质量 gate 负责阻止低质量结果伪装成完成。

只有这四层边界清楚，NovelForge 才能在更换 API、模型变慢、网关 channel 波动时保持可用。
