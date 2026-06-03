# OpenCode Extraction Reliability Audit

## 1. Executive Summary

This document records the OpenCode takeover audit for the "Long-form Extraction Reliability Refactor" (Codex P0).

**Status**: **Boundary Confirmed**. No half-finished code from the previous Codex run remains in the `codex/novelforge-next` branch.

**Conclusion**: The previous Codex attempt (`codex/p0-extraction-reliability-baseline`) was correctly identified as an incomplete experiment and discarded. The current branch is clean and ready for a fresh implementation starting with `AttemptStore + Deadline`.

## 2. Codex Artifact Review

**Source**: `project-docs/HANDOFF_CODEX_P0_EXTRACTION_BASELINE.md`, `EXTRACTION_PROVIDER_STRATEGY.md`, `PROGRESS.md`

- **Intent**: Establish a real long-form extraction reliability baseline.
- **Scope**: Observation only (capture attempts, latency, failure types).
- **Outcome**: Failed to produce a finished reliability architecture. Half-finished code was discarded.
- **Valuable Ideas to Absorb**:
  - **Stable Attempt Record**: Fields include `import_task_id`, `chapter_id`, `model_used`, `error_type`, `raw_response_present`.
  - **Canonical Error Taxonomy**: Separate canonical errors from legacy aliases.
  - **`raw_response_present`**: Key discriminator for `SchemaRepairer` eligibility.
  - **`attempt_summary`**: Query-friendly rollup for UI and reports.

## 3. Current Branch State

**Branch**: `codex/novelforge-next` (based on `main`)

**Delta Analysis** (`git diff main..codex/novelforge-next`):
- **Code Changes**: **NONE**. No runtime code was changed.
- **Documentation**: Added `HANDOFF_CODEX_P0_EXTRACTION_BASELINE.md` and updated `PROGRESS.md`.

**Uncommitted Changes**:
- `AGENTS.md`: New file (created by OpenCode).
- `.omo/`: Directory (internal tooling).

**Conclusion**: The codebase is in a clean state. Implementation can proceed safely from the current `codex/novelforge-next` HEAD.

## 4. Runtime Analysis

**Source**: `novelforge-core` codebase inspection + background agent analysis.

### 4.1 Current Reliability Architecture (7 Layers)

The extraction runtime employs a **7-layer resilience architecture**, each layer handling a different failure domain:

1.  **Base Transport (`AIService`)**:
    -   **Adaptive Concurrency**: TCP-like congestion control (slow-start/congestion-avoidance/fast-recovery). Range: 2–10. Target: 95% success rate, 5s response time.
    -   **Rate Limiting**: 60s sliding window. Dual limits: 500 RPM (requests per minute) and 2,000,000 TPM (tokens per minute). Blocks before sending.
    -   **Retry Policy**: Up to 5 retries with exponential backoff (base 2s, max 120s) and ±50% jitter. Retriable errors: 408, 429, 449, 500, 502, 503, 504, `asyncio.TimeoutError`, `ConnectionError`, `OSError`.

2.  **Model Fallback Chain (`AIService._chat_via_rest`)**:
    -   Iterates through candidate models (primary + fallbacks).
    -   If `APIErrorWithStatus` (≥500, 403, 429) or content empty (502) or timeout (503) → tries next candidate.
    -   Auth errors (401/403) → immediate throw (no retry).

3.  **Runtime Model Routing (`ModelRouter`)**:
    -   **Selection Pipeline**: Candidates → Health Rank → Cooldown Filter → Probe Verify → Best Match.
    -   **Probe**: Real extraction call (25s timeout) checking: availability, non-empty response, JSON capability, extraction richness.
    -   **Cooldown**: 180s cooldown on probe failure.

4.  **Persistent Model Health (`ModelHealth`)**:
    -   Events stored in storage backend (`model_health_event_*`).
    -   Sources: `model_route_selected`, `model_route_probe`, `chapter_index_attempt`, `writer_chat_attempt`.
    -   **Ranking**: Weighted score: (Success×24 + ProbePass×12 + Selected×2) - (Fail×18 + ProbeFail×10 + HardError×8 + LatencyPenalty).

5.  **Per-Chapter Attempt Tracking (`ChapterIndexExtractor`)**:
    -   `_extract_chapter_index_with_attempts()` implements granular per-chapter retry loop.
    -   Records: chapter ID, attempt number, status, latency, model, tokens, error type, raw response hash.
    -   Error classification: `rate_limited`, `auth_failed`, `gateway_timeout`, `provider_unavailable`, `json_invalid`, `timeout`, `empty_content`.
    -   Diagnostics aggregated into `ImportAnalysisDiagnostics`.

6.  **Task Scheduler (`AIScheduler`)**:
    -   Priority queue (LOW/MEDIUM/HIGH/CRITICAL).
    -   **429 Handling**: Up to `max_retries` (min 3) with exponential backoff (20s×2^(n-1), cap 300s).
    -   **Repair Strategies**:
        -   `gateway_timeout`/`timeout`/`provider_unavailable` → reduce chunk, extend timeout (to 420s), concurrency=1.
        -   `rate_limited` → cooldown, concurrency=1.
        -   `json_invalid` → increase max_tokens (to 4000).
        -   `empty_content` → switch model.
    -   **3-Stage Pipeline**: `extractor_fast` → `extractor_repair` → `extractor_deep` (quality-gated).

7.  **Partial Failure Tolerance (`ExtractionService`)**:
    -   `extract_all()` uses `asyncio.gather(return_exceptions=True)`.
    -   Single extraction step failure doesn't kill the operation; errors accumulate in `merged["errors"]`.

### 4.2 Current Gaps (Codex Findings Confirmed)

-   **No `AttemptStore`**: Attempt data is spread across multiple modules (extractor, scheduler, API).
-   **No `Deadline`**: Long-form extraction has no per-chapter or task-level timeout enforcement.
-   **No `SchemaRepairer`**: `raw_response_present` is not used to trigger JSON repair logic.
-   **No `Retry Queue`**: Provider failures (429, 504, timeout) are not systematically retried.


## 5. Implementation Boundaries

### 5.1 Must Do (from Codex Takeover Direction)
1.  **Audit**: ✅ **COMPLETE**.
2.  **`AttemptStore`**: Define minimal interface and data model.
3.  **`Deadline`**: Add per-chapter deadline and task-level budget accounting.
4.  **`SchemaRepairer`**: Handle `raw_response_present=true` failures.
5.  **`Retry Queue`**: Handle provider failures systematically.
6.  **`ModelRouter`**: Revisit only after real attempt data exists.

### 5.2 Must NOT Do (from Codex Takeover Direction)
1.  ❌ **Do not** implement `ModelRouter` first.
2.  ❌ **Do not** mix budget/deadline/retry policy into `AIService`.
3.  ❌ **Do not** change `base/rate_limiter.py` or `base/concurrency.py`.
4.  ❌ **Do not** call external providers (no smoke tests).
5.  ❌ **Do not** commit temporary files or sample texts.

## 6. Next Steps

**First Milestone**: `AttemptStore + Deadline`

1.  Define `AttemptStore` interface in `novelforge/extractors/` or `novelforge/services/`.
2.  Define `AttemptRecord` data model (Pydantic).
3.  Implement `Deadline` logic in `AIScheduler`.
4.  Wire `ChapterIndexExtractor` to use `AttemptStore`.
5.  Add tests for attempt field completeness and error taxonomy.
