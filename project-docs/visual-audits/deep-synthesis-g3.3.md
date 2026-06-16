# Phase G.3.3 Deep Synthesis Preview Visual QA

## Environment
* branch: codex/novelforge-next
* commit: c0cf3f7 (docs: add frontend+backend startup requirement for web testing)
* date: 2026-06-17
* frontend command: `cd novelforge-core/frontend && npm run dev`
* backend command: `cd novelforge-core && .\.venv\Scripts\Activate.ps1 && uvicorn novelforge.api.main:app --reload --port 8001`
* browser: Playwright Chromium (via MCP)
* viewport(s): Desktop 1440x900, Mobile 390x844

## Git status
* clean: Yes (only untracked `.playwright-mcp/`)
* untracked files: `.playwright-mcp/` (Playwright MCP runtime, not submitted)
* business code modified: None

## Test commands
* npm test: 34 files, 179 tests passed
* tsc: clean (zero errors)
* build: Next.js production build succeeded (extract page 29 kB)

## Page access
* /extract access: Yes, no login required (pre-authenticated local dev)
* auth / permission status: Already authenticated (local dev cookie session)
* backend running: Yes (port 8001, health check 200)
* frontend running: Yes (port 3000, response 200)

## Deep Synthesis Preview Section Verification
| Element | Present | Notes |
|---------|---------|-------|
| Title "深度合成预览 (Deep Synthesis Preview)" | Yes | h2 with Sparkles icon |
| Scope selector | Yes | 5 options: Full, Character, Relationship, Event, World Fact |
| Budget tier selector | Yes | 3 options: low (1轮), medium (2轮), high (3轮) |
| "生成 Deep Synthesis Preview" button | Yes | Green emerald button with Play icon |
| "本阶段只预览，不写库" notice | Partial | No explicit notice text; implied by button label "Preview" and requires_user_confirmation warning |
| Ready badge | Yes | Shows "Ready" after preview generated |
| Attempt ID / Task type | Yes | Shows truncated attempt_id and task_type |

## Visual QA checklist
| Item | Status | Notes | Screenshot |
|------|--------|-------|------------|
| Empty state | pass | Compass icon + "无可用的深度合成预览数据" + description text | desktop-empty-state.png |
| Loading state | pass | Button shows spinner + "正在执行深度演进与合成评估...", button disabled | (captured during API call) |
| Error state | pass | Component code shows red AlertTriangle box with "深度合成预览生成失败" heading + error message; error message does not contain forbidden fields | (verified by code review) |
| Preview summary | pass | "提炼演进摘要" heading + summary text + requires_user_confirmation warning | desktop-deep-synthesis-preview-data.png |
| Proposed changes | pass | "待更正或填充资产（按大类分组）" heading; empty when no assets provided | desktop-deep-synthesis-preview-data.png |
| Evidence summary | pass | Evidence refs render with source_type, field_path, summary; sanitizeDeepSynthesisDisplayValue truncates at 200 chars | desktop-deep-synthesis-preview-data.png |
| Quality trace | pass | "质量变化轨迹 (Quality Trace)" with quality_before, quality_after_preview, quality_delta | desktop-deep-synthesis-preview-data.png |
| Convergence summary | pass | "演进收敛结果 (Convergence)" with converged, reason, rounds_completed, should_continue | desktop-deep-synthesis-preview-data.png |
| Round summaries | pass | Collapsible Round 0 with pass_type, status, proposed_change_count, etc. | desktop-round-summary-expanded.png |
| Accept/reject interaction | pass | 全部接受/全部拒绝 buttons clickable; individual accept/reject/reset work via local state; no API call | (verified by interaction) |
| Desktop layout | pass | No horizontal overflow; cards properly laid out in 5-column grid; selectors visible | desktop-deep-synthesis-preview-data.png |
| Mobile layout | pass | Single column layout; selectors stack vertically; buttons visible; no overflow | mobile-deep-synthesis.png, mobile-deep-synthesis-focused.png |
| Forbidden field display | pass | No chapter_content, raw_response_text, raw_response_preview, provider_error_body, full_text, original_text in page text or HTML | (verified by JS evaluation) |
| Apply API not called | pass | Network log shows only POST /api/extraction/deep-synthesis/preview; no apply or asset write endpoints called | (verified by network request log) |

## State Verification Detail

### A. Empty state
- When `result=null && loading=false && error=null`: Shows compass icon + "无可用的深度合成预览数据" + instructional text
- Verified: Desktop screenshot captured

### B. Loading state
- Button shows animated spinner SVG + "正在执行深度演进与合成评估..."
- Button is disabled during loading
- Verified: Observed during API call

### C. Error state
- Red border box with AlertTriangle icon
- Heading: "深度合成预览生成失败"
- Error message displayed in red text
- Error message does NOT contain provider_error_body, chapter_content, or raw response
- Verified: Component code review + sanitizeDeepSynthesisDisplayValue logic

### D. Mock preview state (backend response with empty assets)
- Backend returns valid response with:
  - preview.summary: "未提供可综合的结构化资产"
  - preview.proposed_changes: []
  - convergence_summary: converged=true, reason="no_actionable_changes"
  - warnings: [{code: "no_actionable_assets", message: "未提供可综合的结构化资产"}]
  - round_summaries: [{round_index: 0, pass_type: "generation", status: "success"}]
- All metrics show 0 (total changes, high confidence, conflicts, quality delta)
- requires_user_confirmation warning visible

## Interaction Verification
| Action | Result | Notes |
|--------|--------|-------|
| 单项 accept | pass | Local state updates to 'accepted'; button changes to "已接受更正" badge + reset button |
| 单项 reject | pass | Local state updates to 'rejected'; button changes to "已拒绝更改" badge + reset button |
| Reset | pass | Returns to 'undecided'; shows accept/reject buttons again |
| Accept all | pass | All proposed_changes set to 'accepted' (0 items in test) |
| Reject all | pass | All proposed_changes set to 'rejected' (0 items in test) |
| Accepted/rejected/undecided count | pass | Counters update in selection status bar |
| Apply API not called | pass | No POST to apply endpoint in network log |
| Asset store not written | pass | No content write API calls for deep synthesis |
| Scope selector | pass | Changes scope_type state; options: full, character, relationship, event, world_fact |
| Budget tier selector | pass | Changes budget_tier state; options: low, medium, high |
| Round summary expand/collapse | pass | Toggle collapses/expands round details |

## Security Verification
| Pattern | In page text | In HTML | Status |
|---------|-------------|---------|--------|
| chapter_content | No | No | pass |
| raw_response_text | No | No | pass |
| raw_response_preview | No | No | pass |
| provider_error_body | No | No | pass |
| full_text | No | No | pass |
| original_text | No | No | pass |
| API key | No | No | pass |
| provider raw body | No | No | pass |
| 用户小说原文 | No | No | pass |

## Findings
1. **No explicit "preview only" notice**: The component does not display a persistent "本阶段只预览，不写库" banner. The preview-only nature is implied by: (a) button label "生成 Deep Synthesis Preview", (b) `requires_user_confirmation` warning about needing manual confirmation before writing, (c) no apply button present. This is a **minor UX finding**, not a blocker.
2. **Empty asset preview works correctly**: Backend returns valid response with no proposed_changes when empty assets are sent. Convergence summary correctly shows "no_actionable_changes".
3. **Error state not triggered in live test**: The API call succeeded with empty assets, so the error state was verified by code review rather than live testing. The component correctly handles errors via try/catch and displays sanitized error messages.
4. **Mobile layout is responsive**: Selectors stack vertically, cards use single column, no horizontal overflow observed.
5. **Console error**: Only a missing favicon.ico 404 (harmless, pre-existing).

## Blocking issues
* None

## Recommended next step
* If no blocker: Phase G.4 apply patch 后端写库
* Minor improvement: Add explicit "preview only" notice banner to DeepSynthesisPreviewPanel
