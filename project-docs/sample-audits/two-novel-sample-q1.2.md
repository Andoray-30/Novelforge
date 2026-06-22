# Phase Q.1.2 Two Novel Sample Source Boundary Deep Dive & System Split Strategy

> 日期：2026-06-22
> 分支：`codex/novelforge-next`
> 范围：本地脱敏源章节边界复核 / system split 策略 / Q.2 smoke 建议
> Provider：未调用

## Decision

- `SOURCE_BOUNDARY_NOT_FOUND`
- `SYSTEM_SPLIT_REQUIRED`
- `AI_SMOKE_NOT_RUN`

Q.1.2 在 Q.1/Q.1.1 基线之上，对两个本地 `.txt` 样本继续做脱敏结构审计。结论是：两个样本均没有可稳定提取的源章节边界。当前 parser 将每个样本处理为 1 个 fallback 长章节是合理结果，不应为了这两个样本增加样本特化或过度泛化的章节标题规则。

Q.2 若获得明确 provider 授权，应基于通用 system split 继续验证真实 AI import smoke，而不是把正文内 `第...章` token 命中当作章节标题证据。

## Carryover From Q.1 / Q.1.1

| Metric | Sample A | Sample B |
| ------ | -------: | -------: |
| hash prefix | `0A5C408AC258` | `44EBB8B86935` |
| total chars | 110,970 | 95,075 |
| detected_chapters | 1 | 1 |
| metadata_chapter_count | 1 | 1 |
| empty_chapters | 0 | 0 |
| line-start heading match | 0 | 0 |
| `第...章` token hits | 14 | 15 |

Q.1.1 已确认这些 token hit 均出现在正文叙述中，且所在行含句内标点，不是独立章节标题行。

## Redacted Source Boundary Audit

本轮只记录聚合指标，不记录样本路径、文件名、作品名、角色名、地名或原文片段。

| Metric | Sample A | Sample B |
| ------ | -------: | -------: |
| total lines | 4,593 | 4,004 |
| non-empty lines | 4,372 | 3,800 |
| empty lines | 221 | 204 |
| average line length | 22.2 | 21.7 |
| max line length | 134 | 202 |
| line-start chapter heading candidates | 0 | 0 |
| numbered heading sequences | 0 | 0 |
| prologue / epilogue / interlude style line-start hits | 0 | 0 |
| prologue / epilogue / interlude style in-body mentions | 16 | 21 |
| decorative separator lines | 42 | 33 |
| blank-line blocks | 199 | 179 |
| average blank-line block length | 1.1 | 1.1 |
| max blank-line block length | 3 | 3 |
| paragraph blocks | 200 | 180 |
| average paragraph block chars | 550.6 | 523.9 |
| paragraph block P50 chars | 36 | 40 |
| paragraph block P90 chars | 1,844 | 1,754 |
| paragraph block P95 chars | 2,561 | 2,845 |
| max paragraph block chars | 4,698 | 4,449 |
| in-body `第...章` hits | 14 | 15 |
| in-body `第...章` hits with sentence punctuation | 14 | 15 |
| pure numeric short lines | 0 | 0 |
| numeric-like heading lines | 0 | 0 |

注：`average line length` 为本轮边界审计使用的结构性行统计，主要用于本轮两个样本之间的相对比较；Q.1 历史报告存在不同统计口径，因此不用于跨轮趋势判断。

### Boundary Interpretation

- 两个样本的独立行首章节标题候选均为 0。
- 两个样本均没有连续编号标题序列。
- 序章、终章、尾声、后记、幕间、楔子、引子、前言等候选只在正文内出现，没有形成独立分隔行。
- 装饰性分隔符数量非零，但不能直接视为章节边界；如果将其纳入章节标题 heuristic，容易产生空章节或过碎片段。
- 段落块尺寸呈现长短混合，但没有稳定的“章节标题行 + 正文块”结构。

综合判断：两个样本的 `stable_source_boundaries` 均为 `no`，置信度为高。

## System Split Reality

当前导入链路的相关实现事实：

- `novelforge-core/novelforge/services/ai_scheduler.py` 中 `_resolve_import_chapter_max_chars()` 读取 `extractor_fast.chunk_size`，默认 2,500；`NOVELFORGE_IMPORT_CHAPTER_MAX_CHARS` 可硬覆盖，但会 clamp 到 800-12,000。
- `_split_long_import_chapter()` 在 `max_chars` 的 55%-100% 窗口内优先寻找段落或句末边界，再生成 `system_split` 片段。
- system split 片段当前会记录 `source_type=system_split`、`split_from_title`、`split_from_chapter_index`、`split_part`、`split_total`、`segment_index`、`original_title`、`display_title`。
- `ExtractionService` 的 unified extraction 使用独立的 `ExtractionConfig(chunk_size=15000, chunk_overlap=500)`；recall chunker 使用 12,000 / 1,000。导入拆分不应被误写为统一提取 chunk 配置。

## Chunk Size Comparison

理论段数按字符长度向上取整估算；实际段数会因句子/段落边界选择略有偏差。

| Import split max chars | Sample A estimated chunks | Sample B estimated chunks | Interpretation |
| ---------------------: | ------------------------: | ------------------------: | -------------- |
| 2,500 | 45 | 39 | 当前默认；调度和 UI 负载最高，跨段一致性风险最高。 |
| 6,000 | 19 | 16 | 调度压力明显降低，单段上下文更完整。 |
| 10,000 | 12 | 10 | 上下文、调度、UI 可读性之间较均衡。 |
| 12,000 | 10 | 8 | 在当前 clamp 上限内段数最低，并与 recall chunker 尺寸对齐。 |

### Strategy Recommendation

- Q.2 smoke 建议优先评估 10,000-12,000 字符的 system split，而不是继续使用 2,500 字符作为长篇导入 smoke 的主要风险面。
- 12,000 与 recall chunker 的窗口一致，段数也最低；如果 provider context、timeout、max_tokens 设置允许，可作为首选 smoke 配置。
- 10,000 可作为保守备选，适合在 provider 上下文或延迟风险不明确时使用。
- 导入拆分阶段不建议强制 overlap。导入 system split 的目标是持久化可追踪章节资产；语义 overlap 应由 unified extraction / recall 阶段负责。
- 如果未来需要跨 system split 片段增强连续性，可补充 `prev_segment_id` / `next_segment_id` 或等价顺序引用，而不是复制正文 overlap。

## Generic Metadata Recommendation

后续 system split 应保持或补充以下通用元数据，避免把低置信源边界伪装成真实章节：

- `source_unit_id`：原始导入单元标识，可由 import run / source fingerprint 派生。
- `system_chunk_index`：系统拆分后的 1-based 全局片段索引。
- `original_order`：原始文本顺序，可由 `start_position` / `end_position` 表示。
- `source_boundary_confidence`：当前两个样本应为 `low`。
- `char_range`：片段字符范围或字符数。
- `overlap_policy`：当前建议为 `none`。
- `display_title_strategy`：例如 `original title + 片段序号`，避免误称自然章节标题。
- `volume_index` / `split_part` / `split_total` / `segment_index`：用于 UI 排序和多卷导航。

## Q.2 Smoke Recommendation

Q.2 仍需明确用户授权后才能调用 provider。授权前不应发送小说正文，也不应声称 AI import 已通过。

建议流程：

1. 先 smoke Sample B，再 smoke Sample A。Sample B 字符量较小、预计 system split 段数更少，失败成本更低。
2. 如果 Sample B 出现结构性失败，例如拆分元数据丢失、系统片段跳号、provider timeout 或重试无法恢复，应先修复再进入 Sample A。
3. 授权说明应明确：将发送小说正文到当前配置 provider；单样本输入规模约 95k-111k 字符；若按 12,000 字符拆分，约 8-10 个 system split 片段进入导入验证。
4. 捕获指标应至少包含：`split_total`、实际片段字符分布、硬截断次数、boundary fallback 次数、每阶段 latency、retry count、error type、关系端点 unresolved 数、timeline mismatch 数、system metadata 连续性。

建议判定：

- `PASS`：两个样本完成导入和深度分析；片段索引连续；无未恢复失败；关系/时间线诊断未出现系统性断裂。
- `PARTIAL`：本地拆分和保存成功，但出现少量 provider retry、低质量资产、关系端点 unresolved 或 timeline mismatch，需要后续 repair/deep 补强。
- `FAIL`：拆分或保存元数据损坏；任一关键阶段不可恢复失败；provider 调用失败且无法重试恢复；或跨段顺序/关系明显失真。

## Q.1.3 Implication

当前没有证据支持立刻扩展 parser 章节标题规则。Q.1.3 若继续，应定位为 focused implementation plan，而不是在 Q.1.2 中直接改代码。

Q.1.3 的合理范围：

- 明确 parser 不应把正文内 `第...章` token 当章节标题。
- 明确装饰性分隔符不得单独触发章节边界。
- 如要新增能力，应基于更多样本总结通用结构特征，并配套回归测试。
- 优先保留 `source_boundary_confidence`，让后续系统区分真实源边界与 system split。

## Safety

- samples committed? no
- raw sample text copied? no
- sample file names copied? no
- provider called? no
- API key exposed? no
- provider raw body included? no
- sample-specific logic added? no
- production extractor logic changed? no
- frontend / UI changed? no

## Final Status

Q.1.2 结论为 `SOURCE_BOUNDARY_NOT_FOUND / SYSTEM_SPLIT_REQUIRED / AI_SMOKE_NOT_RUN`。下一步应在明确 provider 授权后执行 Q.2 Real AI Import Smoke，并优先验证 10,000-12,000 字符 system split 策略的真实稳定性。
