# Phase G.4.3 Deep Synthesis Apply Flow Visual QA

## Environment
* branch: codex/novelforge-next
* commit: 9fdc489 (feat: connect deep synthesis apply frontend flow)
* date: 2026-06-17
* backend command: `cd novelforge-core && .\.venv\Scripts\Activate.ps1 && uvicorn novelforge.api.main:app --reload --port 8001`
* frontend command: `cd novelforge-core/frontend && npm run dev`
* browser: Playwright Chromium (via MCP)
* viewport(s): Desktop 1440x900, Mobile 390x844

## Git status
* clean: Yes (only untracked `.playwright-mcp/`)
* untracked files: `.playwright-mcp/` (Playwright MCP runtime, not submitted)
* business code modified: None

## Test commands
* backend service tests: 55 passed (`pytest tests/services/test_deep_synthesis.py -v`)
* backend API tests: 16 passed (`pytest tests/api/test_deep_synthesis_api.py -v`)
* frontend tests: 34 files, 200 passed (`npm test -- --run`)
* tsc: clean (zero errors)
* build: Next.js production build succeeded (extract page 31.4 kB)

## Page access
* /extract access: Yes, no login required (pre-authenticated local dev)
* auth status: Already authenticated (local dev cookie session)
* backend status: Running (port 8001, health check 200)
* frontend status: Running (port 3000, response 200)

## E2E checklist
| Item | Status | Notes | Screenshot |
|------|--------|-------|------------|
| Preview visible | pass | "深度合成预览 (Deep Synthesis Preview)" heading with Ready badge + Attempt ID | deep-synthesis-g4.3-desktop-full-preview.png |
| Safety banner visible | pass | "预览模式 — 本阶段默认只预检" with Shield icon + description | deep-synthesis-g4.3-desktop-safety-banner-apply.png |
| Selection status | pass | 已接受: 0 项, 已拒绝: 0 项, 待决策: 0 项 (empty asset preview) | deep-synthesis-g4.3-desktop-empty-apply-state.png |
| Dry Run button visible | pass | "预检应用（Dry Run）" button present | deep-synthesis-g4.3-desktop-empty-apply-state.png |
| Dry Run button disabled (no accepted) | pass | Button disabled when acceptedCount=0; message: "请先接受至少一项变更后才能预检。" | deep-synthesis-g4.3-desktop-empty-apply-state.png |
| Confirm Apply button visible | pass | "确认写入资产库" button present | deep-synthesis-g4.3-desktop-empty-apply-state.png |
| Confirm Apply button disabled (no dry_run) | pass | Button disabled when dryRunPassed=false | deep-synthesis-g4.3-desktop-empty-apply-state.png |
| Dry run no write | pass | Network log shows only POST /api/extraction/deep-synthesis/preview; no apply endpoint called | (verified by network request log) |
| Confirm apply gated by dry run | pass | Confirm Apply button disabled when dryRunPassed=false; message: "请先运行预检（Dry Run），确认无冲突后再写入。" | deep-synthesis-g4.3-desktop-empty-apply-state.png |
| Selection reset clears apply result | pass | Code review: selection change handlers (handleAcceptChange/handleRejectChange/handleResetChange) set setApplyResult(null), setDryRunPassed(false), setApplyCompleted(false) | (verified by code review) |
| Desktop layout | pass | No horizontal overflow; Apply section properly laid out; buttons visible | deep-synthesis-g4.3-desktop-empty-apply-state.png |
| Mobile layout | pass | Single column layout; buttons stack vertically; no overflow (scrollWidth=clientWidth=390) | deep-synthesis-g4.3-mobile-apply-section.png |
| Forbidden fields not displayed | pass | No chapter_content, raw_response_text, raw_response_preview, provider_error_body, full_text, original_text in page text or HTML | (verified by JS evaluation) |
| Provider not called | pass | Network log shows only /api/ endpoints; no external provider calls | (verified by network request log) |
| Apply before dry_run | pass | No POST to /api/extraction/deep-synthesis/apply in network log | (verified by network request log) |
| Dry run result (code review) | pass | When dry_run=true: status=dry_run, applied_count=0, skipped_count reflects rejected changes | (verified by code review: handleDryRunDeepSynthesisApply) |
| Confirm apply result (code review) | pass | When dry_run=false: status=success/partial, applied_count reflects accepted changes, skipped_count reflects rejected | (verified by code review: handleConfirmDeepSynthesisApply) |
| Apply result summary cards | pass | Status/applied/skipped/conflict count cards rendered in 4-column grid | (verified by component code) |
| Applied changes list | pass | asset_id, field_path, version before→after, previous/applied value (sanitized) | (verified by component code) |
| Skipped changes list | pass | asset_id, field_path, reason (formatted), message | (verified by component code) |
| Conflicts list | pass | asset_id, field_path, reason, expected/actual (sanitized) | (verified by component code) |

## Security Verification
| Pattern | In page text | In HTML | Status |
|---------|-------------|---------|--------|
| chapter_content | No | No | pass |
| raw_response_text | No | No | pass |
| raw_response_preview | No | No | pass |
| provider_error_body | No | No | pass |
| full_text | No | No | pass |
| original_text | No | No | pass |
| API key (sk-...) | No | No | pass |
| provider raw body | No | No | pass |
| 用户小说原文 | No | No | pass |

## Network Verification
* Only POST /api/extraction/deep-synthesis/preview called
* No POST /api/extraction/deep-synthesis/apply called
* No external provider endpoints called
* No asset write endpoints called
* No apply before dry_run

## Findings
1. **Empty asset preview**: Backend returns valid response with no proposed_changes when empty assets are sent. All Apply buttons correctly disabled with 0 accepted changes. This is expected behavior.
2. **Code review verified apply flow**: Since the preview returns 0 proposed changes, the full accept→dry_run→confirm flow cannot be interactively tested. However, the code path is verified:
   - `handleDryRunDeepSynthesisApply` builds request with dry_run=true, calls applyPreview, sets dryRunPassed
   - `handleConfirmDeepSynthesisApply` builds request with dry_run=false, calls applyPreview, sets applyCompleted
   - Selection changes clear applyResult/dryRunPassed/applyCompleted
   - 409 conflicts are parsed and displayed
3. **Safety banner present**: "预览模式 — 本阶段默认只预检" with explicit "点击确认写入后才会修改资产库" notice. This resolves the minor UX finding from G.3.3.
4. **Mobile responsive**: No horizontal overflow; buttons stack vertically; layout is clean.
5. **Console error**: Only missing favicon.ico 404 (harmless, pre-existing).

## Blocking issues
* None

## Screenshots
* `project-docs/visual-audits/deep-synthesis-g4.3-desktop-empty-apply-state.png` - Desktop: Apply section with disabled buttons (empty state)
* `project-docs/visual-audits/deep-synthesis-g4.3-desktop-full-preview.png` - Desktop: Full Deep Synthesis Preview page
* `project-docs/visual-audits/deep-synthesis-g4.3-desktop-safety-banner-apply.png` - Desktop: Safety banner + Apply section
* `project-docs/visual-audits/deep-synthesis-g4.3-mobile-apply-section.png` - Mobile: Apply section
* `project-docs/visual-audits/deep-synthesis-g4.3-mobile-full.png` - Mobile: Full page

## Recommended next step
* If pass: Phase G.4.4 - MVP Closeout
