# NovelForge Internal Test Results

## 2026-05-29 Goal 20 Long Import And Readiness Smoke

Status: passed for configuration/readiness evidence, with extraction quality correctly downgraded to `low_quality`.

Verified chain:

`local provider config -> long import smoke -> extraction diagnostics -> dashboard quality semantics -> optional AI prologue candidate save card`

### Environment

- Workspace: local NovelForge development environment.
- Backend: local FastAPI service on `127.0.0.1:8001`.
- Frontend: local Next.js service on `127.0.0.1:3010`.
- Browser verification: Playwright fallback after the in-app browser runtime failed to start.
- Provider: NewAPI-compatible server-side configuration.
- Base URL: `https://your-openai-compatible-gateway.example/v1`.
- Model path: Fast/Pro mapping from server `.env`.
- Auth note: local `.env` still does not define persistent `NOVELFORGE_ADMIN_PASSWORD` / `NOVELFORGE_SESSION_SECRET`. Goal 20 adds startup and settings-page warnings for this.

### Long Text Source

- Source: local ignored long sample.
- Original text is not stored in this document and is not committed.
- Script-created input copies and raw smoke JSON are treated as local artifacts only.

### Import Result

- Session id: `smoke_import_20260529_144209`.
- Analysis status: `low_quality`.
- Chapters: 10.
- Characters: 15.
- Relationships: 15.
- Timeline events: 30.
- World assets: 1.
- Failed chapters: 0.
- Unresolved relationship endpoints: 1.
- Timeline mismatch events: 0.
- Quality issues:
  - `关系端点无法映射到角色池：帝`

### Quality Interpretation

- Chapter detection succeeded and long chapters were split into numbered fragments.
- Counts meet the internal minimum for long-form asset coverage.
- The relationship graph still has a closure issue, so the system correctly reports `low_quality` instead of claiming the import is fully completed for writing readiness.
- Dashboard copy now explains that extraction success means assets entered the content library, while writing readiness is a stricter quality signal.
- No obvious mojibake appeared in the UTF-8 parsed result or rendered pages.

### Optional Writing Result

- A real provider call generated a long-project prologue candidate.
- The assistant response included a `save_asset` candidate chapter suggestion.
- The UI rendered the save card; this run did not promote the candidate to a formal chapter.

### Screenshots

Captured screenshots are stored in `project-docs/screenshots/goal20/`:

- `settings-auth-config-warning.png`
- `dashboard-quality-explained.png`
- `long-project-quality.png`
- `long-import-diagnostics.png`
- `extract-completed-next-step.png`
- `optional-long-save-card.png`

### Remaining Risks

- Relationship endpoint normalization still needs a follow-up so short aliases like `帝` close back to the canonical role.
- Project quality currently flags relationship usability as insufficient even when raw relationship count is high; this is conservative, but the next pass should make the exact missing relationship signals easier to act on.
- Persistent admin auth values still need to be set in the real internal-test environment.

## 2026-05-29 Goal 19 Real Smoke Rerun

Status: passed for the core product chain, with deployment-configuration warning.

Verified chain:

`login -> clean project -> import controlled text -> extraction -> extract diagnostics -> dashboard -> characters/world -> workspace -> real AI writing -> save_asset card -> confirm save -> editor saved candidate -> mobile workspace smoke`

### Environment

- Workspace: local NovelForge development environment.
- Backend: local FastAPI service on `127.0.0.1:8001`.
- Frontend: local Next.js service on `127.0.0.1:3010`.
- Browser verification: headless Chrome through CDP fallback.
- Provider: NewAPI-compatible server-side configuration.
- Base URL: `https://your-openai-compatible-gateway.example/v1`.
- Model: `gemini-3.5-flash`.
- Auth note: local `.env` still does not define `NOVELFORGE_ADMIN_PASSWORD`, so the smoke injected a process-only admin password to exercise the login UI. Public/internal deployment should set `NOVELFORGE_ADMIN_PASSWORD` and `NOVELFORGE_SESSION_SECRET` before release.

### Test Text

- Source: synthetic controlled text generated only for this smoke run.
- The text is not the root sample novel and is not committed.
- Original text is intentionally not stored in this document.
- SHA-256: `598f900222eac08c85698fd015b695815530b4ccb187e6f5d1b319aed016b581`.

### Import Result

- Run id: `goal19-20260529015029`.
- Session id: `42cac0a0-d332-4703-a813-e6605d945453`.
- Novel parent id: `novel_42cac0a0-d332-4703-a813-e6605d945453`.
- Import task id: `1780019444851559`.
- Task status: `completed`.
- Analysis status: `completed`.
- Chapters: 6.
- Characters: 10.
- Relationships: 15.
- Timeline events: 20.
- World assets: 1.
- Analysis quality issues: none.

### Writing And Save Result

- AI writing status: `save_card`.
- Saved chapter id: `96db28b2-c137-4b65-9c5d-c50f936d46a5`.
- Editor candidate actions visible: yes.
- `previous_snapshot` entry: not applicable in this run because the saved chapter was a new alternate candidate, not an overwrite/recovery path.
- Writing quality quick read: the generated candidate uses the imported setting and characters, produces an emotional opening scene, and is suitable as an AI candidate version rather than an immediately final chapter.

### Screenshots

Captured screenshots are stored in `project-docs/screenshots/goal19/`:

- `workspace-after-import.png`
- `extract-diagnostics-real.png`
- `dashboard-real-quality.png`
- `characters-real.png`
- `world-real.png`
- `save-card-real.png`
- `editor-saved-candidate.png`
- `mobile-workspace-smoke.png`

### Fixes Made During This Rerun

- Fixed the streaming chat endpoint so it starts the response promptly and sends heartbeat status events while preparing agent context or waiting for the model. This prevents the browser/Next proxy from sitting on an idle connection during long real-model calls.
- Added the missing `/api/ai/suggest-prompts` backend endpoint used by the chat input, removing a real 404 from the workspace runtime path.
- Fixed chapter detection after preprocessing: headings after sentence-ending lines are no longer discarded, and headings embedded in normal sentence lines are rejected when they contain sentence punctuation. This changed the controlled import from 1 detected chapter to 6.

### Remaining Risks

- The dashboard quality panel is stricter than the import quality gate. Even when import analysis completed, it may still flag character/relationship writing readiness as needing repair. This is useful but should be aligned in a later pass so users understand the difference between extraction success and prose-readiness.
- Local deployment still needs persistent admin auth env values. The smoke proves the login UI, but release config must set real admin/session secrets.
- This was a synthetic-text smoke. The long sample novel should still be rerun before claiming long-form extraction quality.

## 2026-05-28 Goal 19 Real Smoke

Status: partial, blocked by external provider authentication.

This run was intended to verify the internal-test chain:

login/open project -> import text -> extract assets -> inspect diagnostics -> write with AI -> save candidate -> open editor.

### Environment

- Workspace: local NovelForge development environment.
- Backend: local FastAPI service on `127.0.0.1:8001`.
- Frontend: local Next.js service on `127.0.0.1:3010`.
- Browser verification: headless Chrome through CDP fallback.
- Model mode: server-side provider configuration.
- Configured base URL: NewAPI-compatible endpoint was configured.
- Configured model from runtime result: `gemini-3.5-flash`.

The in-app browser automation plugin was not usable during this run because the Node REPL kernel failed to start its browser sandbox. The verification therefore used local Chrome/CDP automation instead.

### Test Text

- Source: synthetic controlled text generated only for this smoke run.
- The text was not the root sample novel and is not committed.
- Original text is intentionally not stored in this document.
- SHA-256: `16277b2a9ed1d3bc44349286c9d5eb40a3cad8fe4746c4dd4c8d123f62a0ccbc`.

### Import Result

- Run id: `goal19-20260528151811`.
- Session id: `587344bc-6028-4f1a-a427-3a7d1cb946b4`.
- Novel parent id: `novel_587344bc-6028-4f1a-a427-3a7d1cb946b4`.
- Import task id: `1779981514669985`.
- Task status: `completed`.
- Analysis status: `failed`.
- Chapters: 1.
- Characters: 0.
- Relationships: 0.
- Timeline events: 0.
- World assets: 1.

The import UI rendered and the project was created, but extraction quality was not usable. The result is correctly not considered internal-test ready.

### Writing Result

The writing step did not complete. Backend logs showed provider calls returning `401 Unauthorized` from the configured NewAPI endpoint. No save card was produced and no editor candidate chapter was created.

This is a real blocker, not a UI-only issue. A valid server-side provider key/model permission is required before the full writing save chain can be marked as passed.

### Screenshots

Captured screenshots are stored in `project-docs/screenshots/goal19/`:

- `extract-diagnostics-real.png`
- `dashboard-real-quality.png`
- `characters-real.png`
- `world-real.png`
- `workspace-after-import.png`

Not captured because the provider-auth blocker stopped the chain before those states:

- `save-card-real.png`
- `editor-saved-candidate.png`
- `mobile-workspace-smoke.png`

### Code Adjustments From This Run

- Chat errors now detect provider authentication failures and show a Chinese, user-readable configuration message instead of leaving the user with an unclear stalled writing state.
- `/ai-planning` is downgraded to an experimental explanation page so internal-test users are not sent into an unfinished planning workflow.

### Current Assessment

NovelForge is not yet ready for a complete internal-test signoff. The product shell can create and inspect a project, but this real smoke did not prove the AI writing and save chain because provider authentication failed.

### Required Next Step

1. Configure a valid server-side provider credential and model permission.
2. Re-run Goal 19 from a clean project.
3. Require these states before marking the smoke passed:
   - extraction diagnostics visible,
   - at least minimally usable character/relationship/world assets,
   - AI response produced from current project assets,
   - save card visible,
   - candidate saved,
   - editor opens the saved candidate.

### Follow-up Provider Check

On 2026-05-28 a minimal non-sensitive provider request was retried against the configured NewAPI-compatible endpoint using the server-side environment configuration. The result was still `401 Unauthorized`, with provider text indicating that the token state is unavailable.

Because this check fails before any novel text is involved, the remaining full-chain smoke is blocked on provider credentials/model permission rather than on the latest UI changes.

### Resumed Provider Check

On 2026-05-29 the blocked Goal 19 run was resumed and the same minimal non-sensitive provider check was repeated before attempting another full UI smoke. The configured endpoint and model were still present, but the provider again returned `401 Unauthorized` with the message that the token state is unavailable.

This is the first provider-auth recurrence after resuming the blocked goal. A full smoke was not rerun because it would necessarily fail at the writing/extraction model-call stage and would not produce the missing save/editor evidence.

### Second Resumed Provider Check

On 2026-05-29 the minimal non-sensitive provider check was repeated again. The configured endpoint, key presence, and model were still detected, but the provider again returned `401 Unauthorized` with the same token-unavailable message.

This is the second provider-auth recurrence after resuming the blocked goal. The next identical recurrence should be treated as a renewed blocked state unless the provider credential or model permission changes.

## Goal 21 Long-Form Extraction Retest and Provider Strategy

Date: 2026-05-29

### Purpose

Goal 21 was intended to verify whether short relationship endpoints such as `帝` can be safely normalized to character assets, then rerun a long-form import smoke without relaxing quality gates.

### Code-Level Result

The relationship endpoint normalization path was improved and covered by tests:

- unique single-character aliases can resolve when supported by evidence,
- ambiguous single-character aliases remain unresolved,
- explicit aliases take priority over fuzzy matching,
- unresolved endpoints remain visible in diagnostics,
- endpoint audit data now records match type, confidence, matched character, evidence, and review needs.

Relevant backend tests passed during this run:

- `test_chapter_index_extractor.py`
- `test_ai_scheduler_import.py`
- `test_relationship_extractor.py`
- `test_rate_limiter.py`

### Real Provider Observations

The provider layer, not the relationship normalizer, became the dominant blocker:

- `gemini-3.5-flash` was visible from `/models`, but chat responses produced empty content or route/provider errors in extraction probes.
- `deepseek-ai/deepseek-v4-pro` and `deepseek-ai/deepseek-v4-flash` returned usable content in some calls, but long-form batch extraction produced many `504 Gateway Time-out` responses.
- `mimo-v2.5-pro` was faster on small probes, but returned empty structured extraction arrays for a chapter-index prompt.
- Reducing chunk size and output token budget improved request shape but did not make full long-form extraction stable enough.

### Retest Metrics

Representative real smoke attempts:

- DeepSeek pro run:
  - `chapters=18`
  - `characters=6`
  - `relationships=5`
  - `timeline=4`
  - `world=1`
  - `status=partial`
  - `failed_chapters=16`
  - `relationship_unresolved_endpoints=[]`
  - `relationship_endpoint_mapping_ratio=1.0`
- DeepSeek flash run:
  - `chapters=18`
  - `characters=4`
  - `relationships=2`
  - `timeline=2`
  - `world=1`
  - `status=partial`
  - `failed_chapters=16`
  - `relationship_unresolved_endpoints=[]`
  - `relationship_endpoint_mapping_ratio=1.0`
- Light chunk run:
  - `chapters=24`
  - `characters=5`
  - `relationships=4`
  - `timeline=3`
  - `world=1`
  - `status=partial`
  - `failed_chapters=21`
  - `relationship_unresolved_endpoints=[]`
  - `relationship_endpoint_mapping_ratio=1.0`

The sample text, smoke JSON outputs, copied smoke input files, and logs were cleaned from the workspace and are not committed.

### Assessment

The short-endpoint relationship issue is materially improved, but Goal 21 is not complete. The system did not reach `ready` or a clean `needs_repair` state because too many chapter index calls failed at the provider layer.

The current product risk is architectural: long-form import still depends on one model strategy running a full batch successfully. That is brittle across API gateways and time windows.

### Required Next Step

Implement model routing and resumable extraction before further public/internal readiness claims:

1. Probe candidate models at runtime for non-empty chat, JSON compliance, extraction richness, latency, and current error rate.
2. Route extraction, repair, writing, and judging to different model roles instead of fixed model names.
3. Persist per-chapter index attempts so failed chapters can be retried without rerunning successful chapters.
4. Keep local fallback as low-confidence diagnostic seed only; do not count it as ready-quality AI extraction.

See `project-docs/EXTRACTION_PROVIDER_STRATEGY.md` for the full analysis.
