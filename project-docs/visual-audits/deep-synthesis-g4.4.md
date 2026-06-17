# Phase G.4.4 Deep Synthesis MVP Closeout

## Environment
- branch: codex/novelforge-next
- commit: faa66fe
- date: 2026-06-17

## Synthetic asset
- asset_id: qa-character-apply-001
- asset_type: character
- initial version: v1
- creation method: ContentManager (file storage, direct Python script)
- initial extracted_data:
```json
{
  "profile": {"summary": "旧摘要", "traits": ["沉默"]},
  "metadata": {"status": "draft"},
  "notes": {"deep_synthesis_test": null}
}
```

## Proposed changes

| change_id | field_path | current_value | proposed_value | accepted/rejected/undecided |
|-----------|-----------|---------------|----------------|---------------------------|
| qa-change-summary | profile.summary | 旧摘要 | 新摘要：外冷内热，正在学习信任同伴 | accepted |
| qa-change-status | metadata.status | draft | ready | rejected |
| qa-change-note | notes.deep_synthesis_test | null | should-not-write-undecided | undecided |

## Dry run verification

| Check | Status | Notes |
|-------|--------|-------|
| dry_run status | ✅ pass | response.status = "dry_run" |
| applied_count=0 | ✅ pass | summary.applied_count = 0 |
| no asset write | ✅ pass | asset version unchanged at v1 |
| rejected skipped | ✅ pass | qa-change-status skipped, reason="rejected_by_user" |
| undecided not applied | ✅ pass | qa-change-note skipped, reason="undecided" |
| accepted also skipped (dry_run) | ✅ pass | qa-change-summary skipped, reason="dry_run" |

## Confirm apply verification

| Check | Status | Notes |
|-------|--------|-------|
| accepted applied | ✅ pass | applied_changes[0].change_id = "qa-change-summary" |
| rejected not written | ✅ pass | metadata.status = "draft" after apply |
| undecided not written | ✅ pass | notes.deep_synthesis_test = null after apply |
| version updated | ✅ pass | v1 → v2 |
| final asset readback | ✅ pass | profile.summary = "新摘要：外冷内热，正在学习信任同伴" |

## Conflict verification

| Check | Status | Notes |
|-------|--------|-------|
| version mismatch conflict | ✅ pass | 409, reason="version_mismatch", expected="1", actual="v2" |
| current_value mismatch conflict | ✅ pass | 409, reason="current_value_mismatch", expected="旧摘要", actual="新摘要：外冷内热，正在学习信任同伴" |
| no write on conflict | ✅ pass | asset version unchanged at v2 after both conflict tests |

## Security verification

| Pattern | Status |
|---------|--------|
| chapter_content absent | ✅ pass |
| raw_response_text absent | ✅ pass |
| raw_response_preview absent | ✅ pass |
| provider_error_body absent | ✅ pass |
| full_text absent | ✅ pass |
| original_text absent | ✅ pass |
| API key absent | ✅ pass |
| provider not called | ✅ pass (synthetic data, no provider calls) |

## Test results

| Test suite | Result |
|-----------|--------|
| Backend service tests (test_deep_synthesis.py) | 55 passed |
| Backend API tests (test_deep_synthesis_api.py) | 16 passed |
| Frontend tests | 200 passed (34 files) |
| TypeScript type check | zero errors |
| Production build | success |

## Screenshots
- `deep-synthesis-g4.4-extract-page.png` — /extract page desktop view

## MVP decision
- **Deep Synthesis MVP status: complete**
- Reason: All verification steps passed. Dry run correctly prevents writes, confirm apply correctly writes only accepted changes, conflict detection works for both version and current_value mismatches, and no forbidden fields leak through the API. The full apply flow (preview → user selection → dry run → confirm apply → conflict detection) is end-to-end verified with synthetic data.

## Summary of verified capabilities
1. **Asset creation**: Synthetic character asset created via ContentManager with specific ID
2. **Dry run**: Correctly returns status="dry_run" with applied_count=0, no writes
3. **Confirm apply**: Writes only accepted changes, skips rejected and undecided
4. **Field-level patching**: Nested field paths (profile.summary) correctly patched
5. **Version tracking**: Asset version auto-increments on write (v1 → v2)
6. **Version conflict**: Returns 409 with structured conflict details when expected version mismatches
7. **Current_value conflict**: Returns 409 when field current_value doesn't match actual
8. **No-write on conflict**: Asset unchanged after conflict detection
9. **Security**: No forbidden fields (chapter_content, raw_response_text, etc.) in any API response
10. **Idempotency**: attempt_id generated for each apply operation
