# Codex P0 Extraction Reliability Baseline Handoff

## Background

The `codex/p0-extraction-reliability-baseline` branch was opened to establish a real long-form extraction reliability baseline. The intended scope was observation only: capture chapter-level extraction attempts, model response presence, failure types, latency, retry counts, and enough diagnostics to guide later `AttemptStore`, `Deadline`, `SchemaRepairer`, and `ModelRouter` work.

During the Codex run, the branch started to accumulate useful but incomplete attempt/diagnostics changes. It did not produce a finished reliability architecture and should not be treated as a merge-ready implementation.

## Current Branch State

- Experimental branch: `codex/p0-extraction-reliability-baseline`
- Base commit: `bc16498 Add model role health recommendations`
- Integration branch after cleanup: `codex/novelforge-next`
- The experimental branch had uncommitted changes only. No half-finished code was committed to `main` or `codex/novelforge-next`.
- The local experimental branch is intended to be deleted after this handoff is committed.

Audited commands from the stopped branch:

```text
git branch --show-current
codex/p0-extraction-reliability-baseline

git status --short
 M data/evaluate_import_smoke_quality.py
 M novelforge-core/frontend/src/app/extract/chapter-index-run-utils.ts
 M novelforge-core/frontend/src/components/layout/task-summary.ts
 M novelforge-core/frontend/src/lib/model-route-summary.ts
 M novelforge-core/frontend/src/types/index.ts
 M novelforge-core/novelforge/api/__init__.py
 M novelforge-core/novelforge/extractors/chapter_index_extractor.py
 M novelforge-core/novelforge/services/ai_scheduler.py
 M novelforge-core/novelforge/services/extraction_service.py
 M novelforge-core/novelforge/services/model_health.py
 M novelforge-core/tests/api/test_chapter_index_runs_api.py
 M novelforge-core/tests/services/test_ai_scheduler_import.py
 M novelforge-core/tests/services/test_chapter_index_extractor.py
?? .tmp_pytest/

git diff --stat
13 files changed, 349 insertions(+), 24 deletions(-)
```

## What Was Done

- Attempt fields were partially expanded in `chapter_index_extractor.py`:
  - `import_task_id`
  - `chunk_index`
  - `input_char_count`
  - rough `estimated_input_tokens`
  - `task_role`
  - `started_at` / `ended_at`
  - `raw_response_present`
  - `parsed_candidate_counts`
- `error_type` was partially normalized toward baseline values:
  - `429`
  - `504`
  - `timeout`
  - `empty_content`
  - `json_parse_error`
  - `schema_error`
  - `no_candidates`
  - `unknown`
- A compatibility field, `legacy_error_type`, was sketched so existing repair logic could still read older values such as `gateway_timeout`, `rate_limited`, and `json_invalid`.
- `chapter-index run` API serialization was partially extended with an `attempt_summary`:
  - total attempts
  - successful / failed attempts
  - average latency
  - p95 latency
  - error counts
  - raw-response failure count
  - schema-repair candidate failure count
  - router/retry candidate failure count
- Frontend labels were partially updated for the new error types in:
  - `src/app/extract/chapter-index-run-utils.ts`
  - `src/components/layout/task-summary.ts`
  - `src/lib/model-route-summary.ts`
  - `src/types/index.ts`
- `data/evaluate_import_smoke_quality.py` was partially extended to emit a `reliability_baseline` section.
- `data/run_sample_import_smoke_v2.py` was briefly changed to accept `BOOK_TITLE` from the environment, but this change was discarded with the rest of the branch.

## Test Results Observed

The following tests were run before the branch was stopped:

```text
Backend focused tests:
65 passed

Backend expanded focused tests:
75 passed

Frontend Vitest:
31 files / 133 tests passed

TypeScript:
npx tsc --noEmit --incremental false passed

Frontend build:
npm run build passed

compileall:
chapter_index_extractor.py / extraction_service.py / ai_scheduler.py / api/__init__.py / model_health.py passed

git diff --check:
passed
```

Important caveat: these tests only validated the partial implementation while it existed in the experimental branch. Since the half-finished code was intentionally discarded, these test results are evidence for design direction only, not evidence of current product behavior on `codex/novelforge-next`.

## Smoke Attempts

- Real sample smoke with the local long-form novel text was blocked by safety policy because it would send the local sample novel to an external provider.
- A non-sensitive controlled synthetic long text of about 84 KB was generated under `.tmp_pytest/`.
- The controlled 84 KB smoke attempted a real provider call and timed out after 20 minutes.
- A smaller controlled synthetic text of about 27 KB was generated, but no follow-up smoke was completed before this branch was stopped.

Conclusion: the run produced a useful operational signal: long-text extraction is still too easy to blind-run into provider latency/timeouts. It did not produce a reliable baseline report.

## Valuable Ideas To Absorb Later

The following ideas are worth carrying forward into a clean implementation:

- A stable attempt record with:
  - `import_task_id`
  - `chapter_id`
  - `chapter_title`
  - `chunk_index`
  - `input_char_count`
  - `estimated_input_tokens`
  - `model_used`
  - `task_role`
  - `started_at`
  - `ended_at`
  - `latency_ms`
  - `status`
  - `error_type`
  - `raw_response_present`
  - `parsed_candidate_counts`
  - `retry_count`
- Separation between canonical error taxonomy and legacy/adapter-specific aliases.
- `raw_response_present` as the key discriminator for whether `SchemaRepairer` might help.
- `attempt_summary` as a query-friendly rollup for UI and reports.
- Tests for:
  - attempt field completeness
  - error taxonomy mapping
  - repair strategy compatibility
  - API summary serialization

## Why This Branch Should Not Be Merged

- It did not implement a real `AttemptStore`.
- It did not implement a recoverable deadline-aware scheduler.
- It did not implement `SchemaRepairer`.
- It did not implement a clean provider/model routing policy.
- Attempt observation was spread across existing extractor, scheduler, API, and frontend modules.
- The smoke process started shrinking synthetic input size to get a run to complete, which risks optimizing around test convenience instead of real reliability.
- It modified product code but did not finish the architecture needed to make those fields authoritative.

For these reasons, the branch is useful as an audit artifact only. It should not be merged directly.

## What Should Not Continue

- Do not keep blindly running external providers to manufacture a passing smoke result.
- Do not keep shrinking the sample text just to avoid timeouts.
- Do not add more observation fields directly into the existing extractor and scheduler without a storage boundary.
- Do not implement ModelRouter first.
- Do not mix budget/deadline/retry policy into `AIService`.
- Do not change `base/rate_limiter.py`, `base/concurrency.py`, or `AIService` as part of the first cleanup pass.

## Recommended Opencode Takeover Direction

The next implementation should start from a clean branch based on `codex/novelforge-next`, not from the discarded experimental branch.

Recommended order:

1. Audit current extraction runtime and storage boundaries.
2. Define a minimal `AttemptStore` interface and data model.
3. Add per-chapter deadline and task-level budget accounting.
4. Record attempts through the store, not ad hoc lists embedded in multiple modules.
5. Add `SchemaRepairer` for failures with `raw_response_present=true` and JSON/schema parse errors.
6. Add a retry queue for provider failures, timeout, 429, and 504.
7. Only after real attempt data exists, revisit ModelRouter.

The first opencode milestone should be: `AttemptStore + Deadline`, not ModelRouter.
