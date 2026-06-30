# Phase Q.2.3 Sample B SiliconFlow Flash Extraction

> 生成日期：2026-06-30
> 分支：`codex/novelforge-next`
> 范围：Q.2 Sample B 真实 AI import / SiliconFlow Flash provider 验证 / R.0 provider health gate 验证
> Provider：called

## Decision

- `PASS`
- `PROVIDER_HEALTH_GATE_PASSED`
- `SAMPLE_B_EXECUTED`
- `SAMPLE_A_NOT_EXECUTED`

本轮按用户指定临时切换到 SiliconFlow，模型严格使用 `deepseek-ai/DeepSeek-V4-Flash`，未使用 pro 模型，未使用 GPT/Claude，未配置 fallback。所有配置均为进程级覆盖，未写入 `.env` 或 tracked config。

## Runtime Configuration

| Item | Value |
|------|-------|
| provider | SiliconFlow |
| base URL | `https://api.siliconflow.cn/v1` |
| model | `deepseek-ai/DeepSeek-V4-Flash` |
| model router | enabled |
| extractor candidates | locked to `deepseek-ai/DeepSeek-V4-Flash` for fast/deep/repair/schema_repair roles |
| import split max chars | `12000` |
| extractor_fast concurrency | `1` |
| extractor_fast timeout | `300s` |
| extractor_fast max_tokens | `3500` |
| extractor_fast chunk_size | `2500` |
| fallback used | false |
| pro model used | false |

## Sample

| Item | Value |
|------|-------|
| sample | Sample B only |
| sample hash prefix | `44EBB8B86935` |
| sample chars | `95,075` |
| sample bytes | `268,354` |
| temp copy used | yes |
| original path passed to scheduler | no |
| temp copy cleaned | yes |
| temp dir cleaned | yes |

## Preflight

| Field | Result |
|-------|--------|
| selected_model | `deepseek-ai/DeepSeek-V4-Flash` |
| reason | `probe_passed` |
| candidates | [`deepseek-ai/DeepSeek-V4-Flash`] |
| available | true |
| non_empty_chat | true |
| json_capable | true |
| extraction_rich | true |
| latency | `10768ms` |
| score | 95 |

The extraction run also recorded a route probe for the same model:

| Field | Result |
|-------|--------|
| selected_model | `deepseek-ai/DeepSeek-V4-Flash` |
| reason | `probe_passed` |
| latency | `15344ms` |
| score | 95 |

## Execution Result

| Metric | Result |
|--------|--------|
| task status | `completed` |
| analysis_status | `completed` |
| provider_unavailable | no |
| elapsed | `884.9s` |
| chapters_count | 8 |
| chapters_total | 8 |
| chapters_indexed | 8 |
| failed_chapters | 0 |
| chapter_index_attempts | 9 |
| chapter_index_failed_attempts | 1 |
| chapter_index_needs_retry | 0 |
| characters_count | 15 |
| relationships_count | 22 |
| timeline_count | 32 |
| world_count | 1 |
| quality_issue_count | 0 |

## Stage Results

| Stage | Result |
|-------|--------|
| chapter_index | completed |
| characters | completed |
| timeline_events | completed |
| world_setting | completed |
| relationships | completed |

## Candidate Counts

| Metric | Result |
|--------|--------|
| chapter_character_candidates | 40 |
| chapter_interaction_candidates | 40 |
| chapter_event_candidates | 32 |
| chapter_world_fact_candidates | 40 |
| merged_characters | 15 |
| merged_relationships | 22 |
| merged_timeline_events | 32 |

## Safety

| Item | Status |
|------|--------|
| API key in report | no |
| raw sample text in report | no |
| provider raw body in report | no |
| provider request ID in report | no |
| `.env` edited | no |
| sample files committed | no |
| temp files left behind | no |

## Conclusion

SiliconFlow `deepseek-ai/DeepSeek-V4-Flash` is currently the best tested extraction provider for Sample B. It passed the NovelForge extractor gate, completed all 8 chapter segments, and produced usable structured outputs without pro/fallback routing.

当前阶段建议：以 SiliconFlow Flash 作为后续提取任务的临时 provider 配置；如果继续测试 Sample A，应沿用同样的进程级覆盖、12k split、concurrency 1、temp-copy input、安全脱敏报告流程。
