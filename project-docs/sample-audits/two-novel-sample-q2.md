# Phase Q.2 Real AI Import Smoke with Explicit Provider Authorization

> 日期：2026-06-22
> 分支：`codex/novelforge-next`
> 范围：真实 AI 导入 smoke / system split 策略验证 / provider 可用性验证
> Provider：called

## Decision

- `FAIL`
- `PROVIDER_UNAVAILABLE`
- `SAMPLE_B_EXECUTED`
- `SAMPLE_A_NOT_EXECUTED`

Q.2 在用户明确授权后执行真实 AI 导入 smoke。Sample B 按 Q.1.2 建议使用 12,000 字符 system split 执行，本地拆分和持久化成功，但 provider（NewAPI gateway -> deepseek-v4-flash）完全不可用（gateway_timeout），导致 AI 提取失败。Sample A 未执行。

## Authorization

| Item | Status |
|------|--------|
| explicit authorization present | yes |
| provider called | yes |
| sample text sent to provider | yes (在 probe 和 chapter extraction 阶段) |
| scope acknowledged | yes (10,000–12,000 chars system split，先 Sample B 后 Sample A) |

## Environment

| Item | Value |
|------|-------|
| branch | codex/novelforge-next |
| commit | 3752a66 |
| provider configured | yes (.env 包含 OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, NOVELFORGE_FAST_MODEL, NOVELFORGE_PRO_MODEL) |
| model routing mode | auto (基于 model_health 评分) |
| import split max chars | 12000 (via `NOVELFORGE_IMPORT_CHAPTER_MAX_CHARS=12000` 环境变量) |
| sample order | Sample B only (Sample A not executed due to Sample B failure) |

## Baseline Tests

| Test | Result |
|------|--------|
| test_text_processing_service.py | 17 passed |
| test_ai_scheduler_import.py | 37 passed |

## Sample Results

| Metric | Sample B | Sample A |
|--------|----------|----------|
| run? | yes | no |
| hash prefix | `44EBB8B86935` | `0A5C408AC258` |
| total chars | 95,075 | 110,970 |
| analysis_status | failed | n/a |
| total latency (s) | 454.0 | n/a |
| saved chapter assets | 8 | n/a |
| split_total | 8 | n/a |
| split sequence continuous | yes | n/a |
| split char distribution | min 6,927, max 12,000, 7 段 ~12k, 1 段尾部余量 | n/a |
| characters_count | 0 | n/a |
| world_count | 1 (空世界观模板) | n/a |
| timeline_count | 0 | n/a |
| relationships_count | 0 | n/a |
| retry count | 16 (8 章 × 2 次尝试) | n/a |
| timeout count | 0 (客户端无超时) | n/a |
| provider error count | 8 (所有章均失败) | n/a |
| hard truncation count | 7 (7 段达到 ~12k 上限，1 段为尾部余量) | n/a |
| relationship unresolved endpoints | 0 | n/a |
| timeline mismatch count | 0 | n/a |

## Sample B Chapter Content Length Distribution

| 片段 | chars |
|-----:|------:|
| 01 | 11,985 |
| 02 | 11,997 |
| 03 | 12,000 |
| 04 | 11,997 |
| 05 | 11,989 |
| 06 | 11,973 |
| 07 | 11,997 |
| 08 | 6,927 |
| **合计** | **94,865** |

注：原始 95,075 chars，拆分后合计 94,865 chars（差值 210 chars 来自预处理空白规范化和段落边界调整）。

## Stage Results

| Stage | Sample B | Sample A | Notes |
|-------|----------|----------|-------|
| chapter_index (extractor_fast) | completed (但所有 8 章均 failed) | n/a | Provider 返回 gateway_timeout / auth_failed |
| characters | failed | n/a | 依赖 chapter_index，无可用章节 |
| world_setting | partial (空模板) | n/a | 未调用 provider |
| timeline_events | failed | n/a | 依赖 chapter_index |
| relationships | failed | n/a | 依赖 chapter_index |
| repair_failed_chapters (extractor_repair) | recommended (未执行) | n/a | Stage pipeline 决策为阻塞 |
| deep_asset_enrichment (extractor_deep) | blocked | n/a | 依赖前置阶段 |

## Model Route & Provider Probe Results

| 指标 | 值 |
|------|-----|
| selected_model | deepseek-ai/deepseek-v4-flash |
| reason | no_probe_passed_using_best_score |
| profile_confidence | low |
| runtime_settings.timeout | 180.0s |
| runtime_settings.concurrency | 4 |
| runtime_settings.chunk_size | 2500 |
| runtime_settings.max_tokens | 2500 |
| probe flash available | **False** (gateway_timeout, 72,824ms) |
| probe pro available | **False** (gateway_timeout, 91,255ms) |

## System Split Metadata Observation

Q.1.2 建议的 system_split 结构化字段（`source_type`、`split_part`、`split_total`、`segment_index`、`display_title`、`original_order`、`char_range`）未出现在 Content API 返回的 metadata 或 extracted_data 中。

拆分信息仅体现在章节标题中（「片段 01」至「片段 08」），结构化元数据未通过 API 暴露。章节持久化后的 metadata key 列表为：`[author, children_ids, created_at, id, parent_id, session_id, status, tags, title, type, updated_at, version]`。

这可能是：
1. Content 序列化层未映射这些字段到 API 响应
2. 这些字段存储在 ContentManager 内部但未暴露
3. Import 流程未写入这些字段到 extracted_data（需要代码审查确认）

## Quality Findings

### 成功项

1. **本地拆分机制正常工作**：`NOVELFORGE_IMPORT_CHAPTER_MAX_CHARS=12000` 配置生效，8 个章节的字符长度符合预期（7 段 ~12k，1 段尾部余量）。
2. **拆分序号连续**：章节标题「片段 01」至「片段 08」无跳号。
3. **基线测试通过**：text_processing 和 ai_scheduler 测试套件无回归。
4. **重试机制触发**：每章失败后执行 1 次重试（总计 16 次尝试），符合预期。

### 失败项

1. **Provider 完全不可用**：两个模型（deepseek-v4-flash、deepseek-v4-pro）均返回 `gateway_timeout`，probe 评分为 0。这是 NewAPI gateway 侧问题，非 NovelForge 代码缺陷。
2. **AI 提取链路未验证**：由于 provider 失败，character / relationship / timeline / world 提取未执行，Q.2 核心目标无法达成。
3. **System split 元数据未暴露**：如果后续需要程序化读取 split_part / split_total / segment_index，当前 Content API 不返回这些字段。

### 观察

- Import 任务完成状态为 `completed`，但 `analysis_status` 为 `failed`，UI 可能需要区分"导入完成但提取失败"与"导入完全失败"。
- Retry queue 未自动重新入队失败章节，可能需要手动触发 `extractor_repair` 阶段。

## Risks

| Risk Category | Severity | Description |
|---------------|----------|-------------|
| provider availability | **critical** | NewAPI gateway 当前完全不可用，两个模型均 gateway_timeout，无法验证 AI 提取质量 |
| system_split metadata visibility | medium | 结构化元数据未通过 Content API 暴露，可能影响后续程序化处理或 UI 展示 |
| single sample validation incomplete | high | 仅验证了本地拆分和持久化，AI 提取链路未经真实 provider 测试 |
| split quality | unknown | 12,000 字符 split 对叙事连贯性的影响未知（provider 失败导致无法验证关系召回和时间线一致性） |
| relationship recall | unknown | 未产生 relationship 数据，无法验证跨章节关系端点归一化 |
| timeline alignment | unknown | 未产生 timeline 数据，无法验证跨章节时间线一致性 |
| UI load | unknown | 8 个 system split 章节的 UI 渲染性能未验证 |
| provider cost | low | 本轮 probe 和 chapter extraction 尝试消耗 token 较少（所有请求均失败） |
| recovery | partial | 重试机制触发但未能恢复，extractor_repair 阶段被 pipeline 推荐但未执行 |

## Safety

| Item | Status |
|------|--------|
| samples committed? | no (两个 .txt 文件仍为 untracked) |
| raw sample text in report? | no |
| provider raw body in report? | no (仅记录 error type 和 latency) |
| API key exposed? | no (.env 内容脱敏，仅记录 configured yes/no) |
| sample-specific logic added? | no |
| production extractor logic changed? | no |
| frontend / UI changed? | no |
| runtime DB committed? | no |

## Recommended Next Tasks

### 短期（blocking Q.2 重新执行）

1. **确认 NewAPI gateway 恢复**：可运行轻量 probe 请求或直接联系 gateway 维护方。
2. **Provider 恢复后重新执行 Sample B smoke**：复用已有章节资产或新建 session，重点验证 AI 提取链路。
3. **Sample B PASS 后执行 Sample A**：按原计划先短后长。

### 中期（Q.2 通过后）

4. **Q.2.1 System Split Metadata Exposure Audit**：确认 `source_type` / `split_part` / `split_total` / `segment_index` / `display_title` / `original_order` / `char_range` 是否存储在 ContentManager 内部但未暴露到 API，或需要补充写入逻辑。
5. **Q.3 Multi-sample Quality Matrix**：在 Q.2 PASS 后，与之前样本做质量对比。

### 长期（并行推进）

6. **P.1 Extract Page Load Speed Audit**：验证 8-10 个 system split 章节的 UI 渲染性能。
7. **Provider Fallback Strategy**：考虑多 provider 路由或备用 provider 配置，避免单点失败。

## Final Status

Q.2 结论为 `FAIL / PROVIDER_UNAVAILABLE / SAMPLE_B_EXECUTED / SAMPLE_A_NOT_EXECUTED`。

根据 AGENTS.md §8 规则：「外部模型/API 调用失败时，不允许伪造通过。」本轮 provider 完全不可用，无法验证 Q.2 核心目标（真实 AI import smoke 下的 character / relationship / timeline / world 提取质量）。

下一步应在 provider 恢复后重新执行 Sample B，确认 AI 提取链路通过后再执行 Sample A。
