# Phase Q.1 Two Novel Sample Extraction Readiness & Quality Baseline

> 日期：2026-06-21
> 分支：`codex/novelforge-next`
> 范围：本地解析 readiness / 章节切分 / chunk 计划 / 风险基线
> Provider：未调用

## Decision

- `LOCAL_READINESS_PARTIAL`
- `AI_SMOKE_NOT_RUN`

两个 `.txt` 样本均已在仓库根目录发现，路径不同且 SHA-256 不同，因此可作为两个唯一样本进入本地 readiness 基线。两者均可用 `utf-8-sig` 正常解码，无替换字符，编码风险低。

本轮不执行真实 AI 导入 smoke：当前没有用户对外部 provider 调用的明确授权，也未确认可将小说正文外发到当前 provider。Local readiness 不能等同于真实 AI 导入通过。

## Samples

| Sample | Path | Size | SHA256 prefix | Unique | Notes |
| ------ | ---- | ---: | ------------- | ------ | ----- |
| Sample A | `F:\Cyber-Companion\NovelForge\[雨森焚火].败北女角太多了！ [第一卷].txt` | 313,435 bytes | `0A5C408AC258` | yes | 与 Sample B hash 不同；未提交样本文本 |
| Sample B | `F:\Cyber-Companion\NovelForge\[雨森焚火].败北女角太多了！ [第二卷].txt` | 268,354 bytes | `44EBB8B86935` | yes | 与 Sample A hash 不同；未提交样本文本 |

## Local Parse Readiness

| Metric | Sample A | Sample B | Status |
| ------ | -------: | -------: | ------ |
| decoded encoding | `utf-8-sig` | `utf-8-sig` | pass |
| BOM | none | none | pass |
| newline type | CRLF | CRLF | pass |
| mojibake replacements | 0 | 0 | pass |
| total chars | 110,970 | 95,075 | pass |
| non-empty lines | 4,372 | 3,800 | pass |
| average line length | 23.3 | 22.9 | pass |
| max line length | 134 | 202 | pass |
| punctuation density | 0.0952 | 0.0917 | pass |
| dialogue-line ratio estimate | 0.5005 | 0.4734 | informational |
| ad/header/footer pattern hits | 4 | 5 | medium |
| chapters detected by local heading heuristic | 1 | 1 | partial |
| empty chapters | 0 | 0 | pass |
| shortest chapter chars | 110,970 | 95,075 | partial |
| longest chapter chars | 110,970 | 95,075 | high risk |
| P50 chapter chars | 110,970 | 95,075 | high risk |
| P90 chapter chars | 110,970 | 95,075 | high risk |
| P95 chapter chars | 110,970 | 95,075 | high risk |
| chapters over current 2,500-char split threshold | 1 | 1 | expected split |
| chapters over 12,000-char max clamp | 1 | 1 | high risk |
| estimated saved chapter assets, current default 2,500-char split | 45 | 39 | high volume |
| estimated saved chapter assets, 18,000-char reference target | 7 | 6 | reference only |
| mojibake risk | low | low | pass |

### Readiness Interpretation

- Encoding readiness: pass. Both files decode cleanly with no replacement characters.
- Text structure readiness: partial. The local heading heuristic detects each sample as one long chapter-level unit, which means current import splitting must rely on long-chapter system splitting rather than stable source chapter boundaries.
- Long chapter risk: high. Both samples exceed the current default import split threshold by a large margin.
- Header/footer/ad-text risk: medium. Pattern counts are low but non-zero; no raw text was copied into this report.

## Chunk Plan

The codebase evidence reviewed for Q.1 shows these current chunk-size sources:

- `novelforge-core/novelforge/services/ai_scheduler.py`: import chapter splitting uses `_resolve_import_chapter_max_chars()`, defaulting to the `extractor_fast` chunk size, currently 2,500 chars, clamped to 800-12,000.
- `novelforge-core/novelforge/core/config.py`: model role defaults are `extractor_fast=2500`, `extractor_deep=1800`, `extractor_repair=2000` with env overrides.
- `novelforge-core/novelforge/services/extraction_service.py`: unified extractors use a separate `ExtractionConfig(chunk_size=15000, chunk_overlap=500)` and recall chunking uses 12,000 chars.
- No production chapter-splitting threshold of 18,000 or 18,500 chars was found during Q.1 code exploration; those values should not be documented as current implementation behavior.

| Stage | Sample A chunks | Sample B chunks | Risk |
| ----- | --------------: | --------------: | ---- |
| unified extractors, 15,000-char chunks | 8 | 7 | medium |
| recall pass, 12,000-char chunks | 10 | 8 | medium |
| characters / extractor_fast, 2,500-char planning | 45 | 39 | medium |
| world / extractor_deep, 1,800-char planning | 62 | 53 | medium-high |
| timeline / extractor_repair, 2,000-char planning | 56 | 48 | medium-high |
| relationships | 45-62 planning range | 39-53 planning range | medium; recall should be validated by Q.2 smoke |

## AI Smoke

- authorization: not granted in this turn
- provider called: no
- sample A status: not run
- sample B status: not run

AI smoke is intentionally blocked in Q.1. This report establishes local parse readiness only and does not claim real AI import success.

## Findings

- Two unique `.txt` samples are present and hash-distinct.
- Both samples are decodable with low mojibake risk.
- Both samples are around the intended long-form size band for generalization readiness.
- Chapter-boundary readiness is partial: local heading detection currently sees one long unit per sample.
- Current default saved-chapter split behavior is expected to create many system-split chapter assets: 45 for Sample A and 39 for Sample B under the 2,500-char default.
- The local analysis suggests Q.2 should pay special attention to whether system-split chapters preserve useful ordering, whether relationship recall remains adequate, and whether timeline events stay aligned with source order.

## Risks

- encoding: low
- chapter split: medium, because source headings were not detected as stable multiple chapters by the local heuristic
- long chapter: high, because each sample is a single long unit before system splitting
- timeout: medium, because 39-62 planning chunks per sample can stress provider latency and retry windows
- relationship recall: medium, because long-form relationship extraction depends on full-text chunk recall and endpoint normalization
- timeline consistency: low-medium locally, but must be validated by real AI smoke
- world fact sparsity: medium, because local statistics cannot prove semantic coverage
- UI load/performance: medium if many chapter assets are saved and then rendered together

## Recommended Next Tasks

- Q.2 Real AI Import Smoke with Authorization: run one sample at a time only after explicit user authorization to send the text to the configured provider.
- Q.3 Multi-sample Quality Matrix: compare output quality across the previous sample and these two new samples.
- P.1 Extract Page Load Speed Audit: measure UI/API behavior when many system-split chapter assets are present.
- UX.1 Import Completion Quality Dashboard: expose `completed` / `low_quality` / `partial` / `failed` with actionable next steps.
- OPS.1 Task Recovery & Observability: make timeout, partial, and retry recommendations visible for long-form imports.

## Safety

- samples committed? no
- raw text in report? no
- provider called? no
- API key exposed? no
- provider raw body included? no
- sample-specific logic added? no
- production extractor logic changed? no
- `.txt` samples staged? no
