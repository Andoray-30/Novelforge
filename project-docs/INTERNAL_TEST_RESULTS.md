# NovelForge Internal Test Results

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
