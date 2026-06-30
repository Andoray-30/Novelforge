# Phase Q.2.2 Sample B Retry with Gemini Fallback

> 生成日期：2026-06-30
> 分支：`codex/novelforge-next`
> 范围：Q.2 Sample B 真实 AI import retry / NewAPI 非 GPT-Claude 模型筛选 / R.0 provider health gate 验证
> Provider：called

## Decision

- `PARTIAL`
- `PROVIDER_RECOVERED_FOR_GATE`
- `SAMPLE_B_EXECUTED`
- `SAMPLE_A_NOT_EXECUTED`

本轮先枚举 NewAPI 模型并排除 `gpt` / `claude`，随后对候选模型做合成探测和 NovelForge extractor gate 预检。`mimo-v2.5-pro` 与 `kimi-k2.6-vision` 均未达到稳定重启条件；最终使用 `gemini-3-flash-preview` 执行 Sample B retry。

## Model Selection

| 阶段 | 结果 |
|------|------|
| `/v1/models` total | 24 |
| excluded gpt/claude | 14 |
| tested non-gpt/claude | 10 |
| ping-stable candidates | `mimo-v2.5`, `mimo-v2.5-pro`, `minimax-m2.7` 在更高 `max_tokens=128` 下 3/3 成功；`kimi-k2.6-vision` 3/3 成功；`gemini-3-flash-preview` 2/3 成功 |
| NovelForge extractor gate, `mimo-v2.5-pro` | failed：non-empty，但 `json_capable=false`, `extraction_rich=false`；重复候选复测出现 gateway timeout |
| NovelForge extractor gate, `kimi-k2.6-vision` | unstable：3 次中 1 次通过 |
| NovelForge extractor gate, `gemini-3-flash-preview` | stable：3/3 通过 |

结论：简单 ping 稳定不等于 NovelForge extractor 可用。Q.2 retry 最终选择 `gemini-3-flash-preview`，因为它唯一在本轮重复 extractor gate 中 3/3 通过。

## Retry Environment

| Item | Value |
|------|-------|
| model | `gemini-3-flash-preview` |
| model router | enabled |
| extractor candidates | locked to `gemini-3-flash-preview` for fast/deep/repair/schema_repair roles |
| import split max chars | `12000` |
| extractor_fast concurrency | `1` |
| extractor_fast timeout | `240s` |
| extractor_fast max_tokens | `3500` |
| sample | Sample B only |
| sample hash prefix | `44EBB8B86935` |
| sample chars before processing | `95,075` |
| parsed full text chars | `90,936` |

## Execution Result

| Metric | Result |
|--------|--------|
| task status | `completed` |
| analysis_status | `partial` |
| provider_unavailable | no |
| elapsed | `427.1s` |
| chapters_count | 8 |
| chapters_total | 8 |
| chapters_indexed | 5 |
| failed_chapters | 3 |
| chapter_index_attempts | 11 |
| chapter_index_failed_attempts | 6 |
| chapter_index_needs_retry | 3 |
| characters_count | 10 |
| relationships_count | 15 |
| timeline_count | 19 |
| world_count | 1 |
| deleted_previous_assets | 0 |

## Stage Results

| Stage | Result |
|-------|--------|
| chapter_index | completed, with 3 failed chapters |
| characters | completed |
| timeline_events | completed |
| world_setting | completed |
| relationships | completed |

## Model Route

| Field | Value |
|-------|-------|
| selected_model | `gemini-3-flash-preview` |
| reason | `probe_passed` |
| candidates | [`gemini-3-flash-preview`] |
| probe available | true |
| probe non_empty_chat | true |
| probe json_capable | true |
| probe extraction_rich | true |
| probe latency | `6014ms` |
| probe score | 99 |

Runtime settings used by the selected route:

| Setting | Value |
|---------|-------|
| timeout | `240.0` |
| concurrency | `1` |
| chunk_size | `2500` |
| max_tokens | `3500` |

## Failure Notes

The run is no longer blocked by provider health. However, later chapter attempts encountered NewAPI provider-side failures, including HTTP 403 and a provider billing/preflight-cost failure indicating insufficient remaining balance for the estimated request cost. Raw provider bodies and request IDs are intentionally not recorded here.

This means Q.2 moved from `FAIL / PROVIDER_UNAVAILABLE` to `PARTIAL / PROVIDER_RECOVERED_FOR_GATE`, but it is not a full PASS because 3 of 8 chapter segments still need retry.

## Safety

| Item | Status |
|------|--------|
| original `.txt` passed to scheduler | no |
| temp copy used | yes |
| temp copy cleaned | yes |
| temp dir cleaned | yes |
| Sample B sent to provider | yes, user authorized retry |
| Sample A sent to provider | no |
| raw sample text in report | no |
| provider raw body in report | no |
| API key exposed | no |
| GPT/Claude used | no |
| `.env` edited | no |
| sample files committed | no |

## Next Recommendation

1. Do not run Sample A yet.
2. Top up or switch NewAPI billing/provider capacity before retrying the 3 failed Sample B segments.
3. Re-run only failed chapter segments with the same `gemini-3-flash-preview` route and concurrency 1 after capacity is restored.
4. Treat `mimo-v2.5-pro` as ping-stable but extractor-gate-incompatible unless its JSON behavior improves.
