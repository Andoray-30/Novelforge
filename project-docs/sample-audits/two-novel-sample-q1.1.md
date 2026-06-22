# Phase Q.1.1 Two Novel Sample Extraction Re-audit — Parser Regression Fix & Chapter Boundary Reality Check

> 日期：2026-06-22
> 分支：`codex/novelforge-next`
> 范围：本地解析回归修复 / 章节边界现实检查 / 风险更新
> Provider：未调用

## Decision

- `PARTIAL`
- `AI_SMOKE_NOT_RUN`

Q.1.1 的目标是在 Q.1 基线之上，验证首轮 Q.1.1 尝试中发现的 zero-chapter 回归是否已修复，并重新评估章节边界检测现状。

本轮确认：回归已修复，真实本地样本不再返回零章节。但章节边界检测仍未达到稳定状态，不能作为 Q.2 PASS 证据。

## Regression Fix Summary

Q.1 基线中，本地 heading heuristic 对两个样本均只识别出 1 个长章节级单元。首轮 Q.1.1 尝试时出现了 zero-chapter 回归，即 `TextProcessingService().process_file(path)` 返回 0 个章节。

本轮验证确认：该回归已修复。两个样本均通过 `TextProcessingService().process_file(path)` 返回 1 个 fallback 章节。这与 Q.1 基线一致，说明解析链路本身没有进一步退化。

## Chapter Boundary Deep Check

为了判断这 1 个 fallback 章节是否反映了真实的源章节结构，对两个样本进行了 token-level 分析。

### Token Hit 统计（脱敏）

- Sample A（hash `0A5C408AC258`）：发现 14 处 `第...章` 形 token 命中
- Sample B（hash `44EBB8B86935`）：发现 15 处 `第...章` 形 token 命中

### Line-start Heading Match

- Sample A：0 处
- Sample B：0 处

### 关键观察

所有 token-hit 所在行均包含句内标点（逗号、句号、引号等），说明这些命中出现在正文叙述中，而不是独立的章节标题行。没有行首匹配，也没有出现符合常见章节标题格式的独立行。

因此，当前样本中 `第...章` 的 token 命中属于正文内提及，而非稳定的源章节分隔符。本地 heading heuristic 返回的 1 个 fallback 章节，实质上是将整本小说作为单个长章节处理，而不是识别出了真实的多章节结构。

## Consequence

Q.1.1 不能证明稳定的源章节边界检测能力。零章节回归虽然已修复，但章节切分仍然依赖单一大章节的系统拆分策略。这意味着 Q.2 的 AI smoke 仍然要面对长章节拆分带来的潜在风险，包括但不限于：顺序保持、关系召回、时间线对齐等。

Q.2 AI smoke 在未获得明确 provider 授权前继续保持阻塞状态。

## Test Results

- `.\.venv\Scripts\python.exe -m pytest -q tests/services/test_text_processing_service.py -v` -> 17 passed, 1 pytest cache warning.
- `.\.venv\Scripts\python.exe -m pytest -q tests/services/test_ai_scheduler_import.py -v` -> 37 passed, 1 pytest cache warning.
- `$env:GIT_MASTER='1'; git diff --check` -> no whitespace errors; LF/CRLF warning for `test_ai_scheduler_import.py` only.

## After-audit Metrics（脱敏）

| Metric | Sample A | Sample B |
| ------ | -------- | -------- |
| hash prefix | `0A5C408AC258` | `44EBB8B86935` |
| detected_chapters | 1 | 1 |
| metadata_chapter_count | 1 | 1 |
| empty_chapters | 0 | 0 |
| shortest / longest / P50 / P90 / P95 | 106216 | 90936 |
| chapters_over_2500 | 1 | 1 |
| estimated_assets_at_2500 | 43 | 37 |

## Privacy / Safety

- raw sample text copied? no
- sample file names copied? no in Q.1.1 report
- samples committed/staged? no
- provider called? no
- API key exposed? no
- sample-specific code added? no

## Risks

- chapter boundary detection: still medium-high. Zero-chapter regression is fixed, but stable multi-chapter source boundary detection is not proven.
- long chapter: high. Both samples remain single long units before system splitting.
- split quality: unknown without real AI smoke. System splitting on a single 90k+ char chapter may affect narrative coherence.
- provider cost: medium-high if 43/37 system-split assets trigger per-chapter planning calls.

## Recommended Next Tasks

- **Q.1.2 Chapter Boundary Deep Dive**：聚焦验证这些样本是否真正包含稳定的源章节分隔符，还是仅有正文内章节提及。仍需避免复制原文。
- **Q.2 AI smoke**：继续保持阻塞，直到获得明确的 provider 授权。

## Notes

- 本次审计包含最小 parser / preprocessor 修复、回归测试补充、Q.1.1 文档和进度更新。
- 样本文件名、路径、原文片段均未写入本报告。
- 不声称 Q.1.1 通过。
