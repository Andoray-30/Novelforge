# Deep Synthesis MVP Release Notes

## Status

* MVP status: Complete
* Completion phase: Phase G.4.4
* Closeout commit: d2562b7
* Branch: codex/novelforge-next

## What Deep Synthesis Delivers

1. Design boundary
   * Deep Synthesis 是 preview patch / synthesis layer，不直接覆盖资产
   * 与 deep_asset_enrichment 区分

2. Preview backend
   * DeepSynthesisRequest / Result / Preview / ProposedChange
   * structured asset input
   * no raw novel text

3. Convergence tracking
   * quality_trace
   * round_summaries
   * convergence_summary
   * user_feedback

4. Preview frontend
   * Deep Synthesis Preview Panel
   * budget tier / scope selector
   * proposed changes grouping
   * quality trace / convergence / round summaries

5. Apply backend
   * POST /api/extraction/deep-synthesis/apply
   * dry_run
   * accepted-only apply
   * rejected / undecided skipped
   * field-level patch
   * version check
   * current_value check
   * conflict no-write

6. Apply frontend
   * safety banner
   * Dry Run button
   * Confirm Apply button
   * apply result cards
   * applied/skipped/conflict display
   * 409 structured detail handling

7. MVP closeout verification
   * synthetic asset persistence
   * dry_run no-write
   * confirm apply writes accepted only
   * rejected/undecided not written
   * conflict no-write
   * version v1 → v2

## Safety Guarantees

* No provider call during apply
* No raw novel text required for apply
* No chapter_content
* No raw_response_text
* No raw_response_preview
* No provider_error_body
* No direct DB/file write bypassing ContentManager
* No automatic apply
* No apply before user confirmation
* No write on dry_run
* No write on conflict
* No rejected / undecided write
* Safe 500 responses
* Conflict values truncated / sanitized
* Forbidden field paths blocked case-insensitively

## Verified Test Evidence

* G.4.4 backend service tests: 55 passed
* G.4.4 backend API tests: 16 passed
* G.4.4 frontend tests: 200 passed
* tsc: zero errors
* build: success
* G.3.3 visual QA
* G.4.3 apply flow visual QA
* G.4.4 synthetic asset persistence closeout

## Known Limitations

* No rollback / undo
* Idempotency key exists but full duplicate-submit protection is not productized
* Browser E2E with natural proposed_changes is not fully automated
* G.4.3 page QA used empty preview; G.4.4 persistence proof was API-level synthetic validation
* Multi-asset / batch apply not yet stress-tested
* Apply audit/history UI not implemented
* Apply result does not yet auto-refresh full asset UI everywhere
* Performance-profile global scope has 2 known unrelated failing tests
* Real provider smoke was not run
* Real user novel text was not used

## Operational Notes

* Apply path is deterministic
* Apply should run only after preview and user selection
* UI should require dry_run before confirm
* When conflicts occur, user must regenerate preview or resolve conflict manually
* Synthetic tests are safe and do not require user text

## Release Decision

* Deep Synthesis MVP is complete
* Remaining tasks are post-MVP hardening, not MVP blockers
