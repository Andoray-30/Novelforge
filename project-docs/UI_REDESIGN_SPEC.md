# NovelForge UI Redesign Spec

Date: 2026-05-27

Basis:
- [UI_AUDIT_CURRENT.md](./UI_AUDIT_CURRENT.md)
- [ui-audit-current screenshots](./screenshots/ui-audit-current/)

This document is the implementation contract for the next UI pass. It turns the screenshot audit into page priority, information architecture, visual principles, and staged work. Do not use this as permission for a broad rewrite. The next implementation goals should change one page group at a time and keep existing data flow intact.

## Current Screenshot Audit Summary

The current UI has enough real product surface to continue, but it is visually and structurally inconsistent.

Strongest evidence:
- Login, workspace default, and characters already look closest to a product.
- Workspace has the right strategic direction: chat-first, project-aware, user-confirmed saves.
- Editor now supports real candidate/version workflow, but the interface is dense.

Weakest evidence:
- World is visually fractured and has contrast/readability problems.
- Extract still reads like a dramatic landing page instead of an import workflow.
- Empty project states are confusing and can show "AI thinking" even when no context exists.
- Mobile is usable in places, but not yet comfortable. Secondary panels need consistent drawer or bottom sheet behavior.

Design implication:
- NovelForge should converge on a quiet writing workspace, not a neon data dashboard.
- The product should feel like an AI writing studio with a content library, not an admin console around extraction diagnostics.

## Page Priority

### A Level / A 级核心路径: Core Path

Pages:
- Main workspace
- Editor
- Extract

Current state:
- These pages form the internal-test path: import text, inspect/repair assets, generate writing, confirm save, edit chapters.
- They are functional enough to preserve data flow, but their UI still creates friction.

Main problems:
- Workspace is close, but too many panels compete.
- Editor is a management console rather than a writing surface.
- Extract is not yet a guided import/review flow.

Layout decision:
- Do not throw away the entire workspace/editor/extract implementations.
- Keep the current data flow and component responsibilities.
- Rework information architecture and visual hierarchy first.
- A-level pages should be refactored before B/C pages.

### B Level / B 级资产页面: Asset Pages

Pages:
- Characters
- World
- Dashboard

Current state:
- Characters is visually promising but not yet writer-useful enough.
- World is the most visually inconsistent and needs the strongest redesign.
- Dashboard is useful but should not be the main creative surface.

Main problems:
- Asset pages use different visual languages.
- Cards often show surface stats before writing-useful material.
- World has contrast issues and neon styling that conflicts with the workspace.

Layout decision:
- Characters and World should move to a shared "project library" pattern.
- Dashboard should become a project overview, not an analytics command center.
- World likely needs a layout reset; Characters can be migrated rather than fully replaced.

### C Level / C 级支撑页面: Support Pages

Pages:
- Login
- Settings
- Empty/error states

Current state:
- Login is already good enough.
- Settings is usable but too technical in places.
- Empty/error states are inconsistent and under-designed.

Main problems:
- Empty states do not consistently guide the user to the next action.
- Settings exposes technical model/provider concerns too close to the writing flow.
- Login is visually fine, but should align with light-default direction.

Layout decision:
- Login does not need a layout rewrite.
- Settings needs grouping and language cleanup, not a deep rewrite.
- Empty/error states should be redesigned as shared patterns and reused across pages.

## Global Visual Direction

Default theme:
- Light mode is the default product experience.
- Dark mode remains supported as an alternate comfort mode.

Palette:
- Use white and light gray as the main surface.
- Use small-area purple as NovelForge brand emphasis.
- Use neutral gray for borders, separators, metadata, and inactive controls.
- Use status colors sparingly: success, warning, danger, muted, accent.

Avoid:
- Cyberpunk, neon, glowing large-screen dashboard styling.
- Large gradient hero sections on operational pages.
- Bright cyan/green page-specific themes that break the app language.
- Dense technical badges as the first thing users see.

Typography:
- Writing and content text should be the visual priority.
- Use compact, predictable headings on tool surfaces.
- Avoid hero-scale headings except on a true onboarding surface.

Panels:
- Cards should frame repeated assets, modals, confirmations, or compact tools.
- Do not nest cards inside cards unless there is a real interaction boundary.
- Diagnostics should default to collapsed summaries.

Product feel:
- The app should feel like a mature AI writing studio.
- Data panels support writing; they do not dominate writing.
- The default screen should answer: "What can I write, inspect, or confirm next?"

## Main Workspace Spec

Target role:
- Primary AI writing cockpit.
- The user chats, asks for inspiration, requests edits, confirms save suggestions, and sees just enough project context to trust the output.

Keep:
- Chat-first center.
- Left project/session access on desktop.
- Fast/Pro mode switch in composer.
- Explicit save confirmation cards.
- Project status summary concept.
- Agent trace as an inspectable "writing basis" feature.

Change:
- Reduce duplicated project identity across nav, topbar, sidebar, and chat header.
- Make right-side project status optional/collapsible on desktop and hidden behind drawer/bottom sheet on tablet/mobile.
- Prompt chips should collapse when the viewport is short or when the user has an active conversation.
- Empty project state should show an action panel, not "AI is thinking".

Desktop layout:
- Left app nav: narrow and persistent.
- Project/session sidebar: persistent at desktop width, with quieter visual weight.
- Center chat: dominant width and visual priority.
- Right context rail: optional persistent panel for project status and focused assets; default width should be narrow.

Trace:
- Default collapsed.
- Collapsed summary shows:
  - characters read
  - relationships read
  - world facts read
  - chapter snippets read
  - whether enhanced relationships were used
  - whether fallback happened
- Expanded sections:
  - used assets
  - chapter snippets
  - relationship quality summary
  - repair queue
  - tool calls as advanced details
- Do not expose model chain-of-thought or raw internal traces.
- Tool calls and queue scores are advanced diagnostics, not primary copy.

Save card:
- Default visible rows:
  - asset type
  - title
  - destination
  - primary action
  - skip action
- Preview and impact details are collapsed.
- "Update existing" must remain visually distinct and safer than creating a candidate.
- If writing a chapter, the card should clearly distinguish:
  - AI draft
  - candidate version
  - formal chapter
  - formal prologue
  - overwrite existing

Relationship repair cards:
- Show writer-facing language first.
- Translate internal keys:
  - `emotional_tension` -> 情绪张力
  - `arc` -> 关系弧线
  - `scene_potential` -> 可写场景
  - `dependency` -> 依赖
  - `debt` -> 亏欠
  - `conflict` -> 冲突
- Primary action: 保存为关系补强草稿.
- Secondary action: 更新原关系.
- Tertiary action: 跳过.

Mobile:
- Single column.
- Top bar shows current project and menu.
- Composer remains bottom and easy to reach.
- Project context, focused assets, trace, and save details use drawer/bottom sheet/collapsible.
- No horizontal scroll.
- Primary actions must remain reachable without hunting through multiple panels.

## Editor Spec

Target role:
- AI draft/candidate/formal chapter management plus focused writing.
- It should support both asset workflow and actual prose work.

Keep:
- Chapter directory.
- Directory sorting.
- Filters for imported source, AI draft, candidate, formal, archived.
- Candidate promotion/archival workflow.
- Save chapter action.
- Previous snapshot recovery workflow.

Desktop proportions:
- Directory: 260-320px.
- Writing area: primary flexible region, minimum 50% of available content width.
- Status/inspector: 280-340px and collapsible.
- Text area should not feel like a small form field inside an admin page.

Main writing area:
- Selected chapter title and role visible at top.
- Word count and status are secondary.
- Candidate state should appear as a compact banner above the text:
  - "AI candidate"
  - "Can promote to formal"
  - "Has previous snapshot"
- Do not make the user discover important workflow state only in the inspector.

Candidate management:
- Candidate actions should be near the selected chapter:
  - 转为正式正文
  - 转为正式序章
  - 转为番外
  - 归档候选
- These actions update metadata only; do not imply prose changes.
- Archive remains non-destructive.

Previous snapshot:
- Productize as "可恢复上一版".
- Do not expose raw JSON by default.
- Default display:
  - old title
  - old updated time
  - old content preview
  - restore button
- Raw extracted data goes under "高级详情".
- Restore should open a confirmation modal or bottom sheet.
- Recovery should keep the current version as a recovery snapshot.

Focused writing mode:
- Yes, editor needs a future focus writing mode.
- Focus mode hides directory and inspector by default.
- It keeps only:
  - title
  - prose editor
  - save
  - continue/rewrite/polish entry
  - exit focus mode
- Focus mode is not part of the immediate spec implementation unless Goal 18A-C completes cleanly first.

Mobile:
- Single column.
- Directory becomes drawer.
- Inspector/status becomes bottom sheet.
- Candidate actions become a compact action bar or bottom sheet.
- Restore snapshot opens a bottom sheet.
- Text editor should get most of the viewport.

## Extract Spec

Target role:
- Guided import and quality review.
- The page should help the user move from raw text to usable project assets, then decide what to fix or open next.

Redefine as a four-step wizard.

### Step 1: Choose Or Paste Text

Content:
- Current project target.
- File upload.
- Paste text option.
- Supported formats.
- Optional extraction settings behind "高级设置".

Primary actions:
- 选择文本文件
- 粘贴文本
- 开始导入

Avoid:
- Large hero styling.
- Neon/gradient treatment.
- Showing diagnostics before anything has run.

### Step 2: Extraction Progress

Content:
- Stage checklist:
  - 保存章节
  - 章节索引
  - 角色
  - 关系
  - 时间线
  - 世界观
  - 写入内容库
- Overall progress.
- Current stage message.
- Cancel action.

Rules:
- Disable or visually subordinate upload while a task is running.
- Task center may mirror status, but the page itself should be authoritative.

### Step 3: Quality Diagnostics

Content:
- Status: completed / low_quality / partial / failed.
- Counts:
  - chapters
  - characters
  - relationships
  - timeline events
  - world facts
- Top 3 issues.
- Repair recommendations.

Default:
- Show diagnostic summary.
- Detailed logs, candidate counts, unresolved endpoints, failed chapters, timeline mismatches are collapsed.

Actions:
- 重跑全书分析
- 重跑失败章节
- 回补关系
- 重建时间线
- 打开角色
- 打开 editor

### Step 4: Next Action

Content:
- "资产已进入内容库" confirmation.
- Suggested next steps:
  - 查看角色
  - 查看世界观
  - 打开 editor
  - 让 AI 基于资产写序章

Rules:
- If low_quality, do not block the user, but clearly state which assets need review.
- The page should transition from upload-first to result-first after completion.

Mobile:
- Wizard steps are stacked.
- Progress and diagnostics use compact cards.
- Detailed diagnostics use collapsible sections.

## Characters Spec

Target role:
- Character dossier library.
- It should help the writer understand people, not merely count extracted entities.

Display first:
- Name
- role
- personality
- motivation
- contradiction/conflict
- relationship hooks
- evidence confidence

Secondary:
- aliases
- tags
- source evidence
- extraction metadata
- raw extracted data

Layout:
- Shared asset library header, not a special themed hero.
- Search and filters stay.
- Card grid on desktop.
- Single-column cards on mobile.
- Character detail view should use tabs or sections:
  - Profile
  - Relationships
  - Evidence
  - Writing hooks

Hide or demote:
- Graph/network as a primary CTA until it becomes useful.
- Raw confidence numbers unless the user expands diagnostics.

Old style to remove:
- Heavy archive hero if it overwhelms the actual dossier.
- Overly decorative role badges that compete with content.

## World Spec

Target role:
- Worldbuilding knowledge base.
- It stores locations, organizations, rules, history, culture, concepts, and timeline-adjacent facts.

Display first:
- World/category sections:
  - Locations
  - Organizations
  - Rules
  - History
  - Culture
  - Concepts
- Each fact should show a short summary and evidence/source chapter if available.

Secondary:
- topology/graph
- raw extraction metadata
- advanced diagnostics

Layout:
- Migrate to shared `nf` visual theme.
- Remove neon/cyberpunk large-screen styling.
- Fix all contrast problems.
- Use readable cards and section lists.
- Timeline/history cards must have accessible text contrast.

Hide or demote:
- Topology if it is sparse or visually rigid.
- Debug-like labels.

Old style to remove:
- Large cyan/green hero treatment.
- Dark neon timeline cards in light mode.

## Dashboard Spec

Target role:
- Project status overview.
- It should answer whether the current project is ready to write with, not become the main writing UI.

Display first:
- Current project health.
- Asset counts.
- Quality warnings.
- Recent assets.
- Recent AI saves/candidates.

Secondary:
- trends
- analytics
- advanced task history

Layout:
- Shared `nf` theme.
- Quiet cards.
- No dramatic analytics dashboard styling.
- Link out to Extract, Editor, Characters, World.

Hide or demote:
- Experimental analytics not tied to user action.
- Dense charts without clear decisions.

## Login Spec

Target role:
- Single-admin gate.

Keep:
- Minimal centered form.
- Clear password entry.
- Simple brand signal.

Change:
- Default should align with light mode direction unless dark mode is explicitly selected.
- Add calm deployment/admin copy if needed.
- Keep error state clear and non-technical.

No layout rewrite required.

## Settings Spec

Target role:
- Admin configuration and writing-mode preferences.

Display first:
- Runtime status.
- Public deployment status.
- Model mode mapping:
  - Fast mode
  - Pro mode
- Session/admin controls.

Secondary:
- Provider base URL/key status.
- Raw diagnostics.
- Advanced configuration.

Rules:
- Public user writing flow should not expose provider API key entry.
- Browser-side model override remains hidden/disabled in public deployment.
- Admin panel can configure Fast/Pro model mapping later.

No deep rewrite required, but language and grouping should be cleaned up.

## Empty And Error State Spec

Target role:
- Guide user to the next useful action.

Shared pattern:
- Short title.
- One-sentence reason.
- One primary action.
- One secondary action.
- Optional low-noise details disclosure.

Examples:
- Empty workspace: 导入小说 / 开始空白创作.
- Empty characters: 先导入小说 / 手动创建角色.
- Empty world: 从提取页生成世界观 / 手动添加设定.
- Empty editor: 导入章节 / 新建章节.
- Error state: 重试 / 查看诊断.

Avoid:
- Spinner/thinking states when no request is in progress.
- Technical stack traces as primary copy.
- Blank panels that merely say no data.

## Mobile Rules

Hard rules:
- No horizontal scrolling.
- No desktop multi-column layout.
- Primary content first.
- Complex information folded by default.
- Touch targets at least 40px high.
- Composer and primary action must be easy to reach.

Navigation:
- App nav becomes drawer.
- Project switcher remains in top bar or drawer.
- Secondary context panels use drawer or bottom sheet.

Workspace mobile:
- Chat messages full width.
- Composer fixed or sticky near bottom.
- Trace opens in bottom sheet or inline collapsible.
- Save card actions wrap cleanly.

Editor mobile:
- Directory drawer.
- Status/inspector bottom sheet.
- Candidate actions compact and reachable.
- Snapshot restore bottom sheet.

Extract mobile:
- Wizard steps stacked.
- Upload and progress card should fit without hiding the main status.
- Diagnostics summary appears before detailed logs.

Asset pages mobile:
- Single-column library cards.
- Filters collapse.
- Graph/topology hidden behind secondary action.

## Implementation Plan

### Goal 18A: Extract 导入向导重构

Scope:
- Convert Extract into a four-step wizard.
- Keep current upload/task/diagnostics data flow.
- Replace hero-first layout with workflow-first layout.
- Results-first completed state.
- Collapse advanced diagnostics.

Acceptance:
- Default state clearly asks user to choose or paste text.
- Running state shows stage checklist and progress.
- Completed state shows status, counts, top issues, and next actions above the fold.
- Mobile has no horizontal scroll.

### Goal 18B: Characters / World / Dashboard 资料库化

Scope:
- Move B-level pages toward shared `nf` library styling.
- Characters becomes a dossier library.
- World becomes a worldbuilding knowledge base.
- Dashboard becomes a project overview.

Acceptance:
- World no longer uses neon/cyberpunk styling.
- World timeline/history cards have readable contrast.
- Character cards foreground writing-useful fields.
- Dashboard links clearly to next action pages.

### Goal 18C: Settings / Login / 空状态统一

Scope:
- Align support pages with light-default `nf` theme.
- Clean settings grouping.
- Define reusable empty/error state components or patterns.
- Remove misleading "thinking" states when no task is active.

Acceptance:
- Empty workspace, editor, characters, world, and extract states all show a next action.
- Login remains simple.
- Settings does not expose user-facing API key override in public mode.

### Goal 19: Mobile Polish

Scope:
- Systematically test 390px and 768px layouts after Goal 18A-C.
- Apply drawer/bottom sheet/collapsible patterns consistently.
- Fix touch target and overflow issues.

Acceptance:
- No horizontal scroll on main routes.
- Workspace, editor, extract, characters, world, dashboard, settings are usable at 390px.
- Composer and main actions remain reachable.
- Trace, diagnostics, and inspector content are folded by default.

## Non-Goals For This Redesign Pass

- Do not rewrite agent logic.
- Do not rewrite extraction pipeline.
- Do not change editor save semantics.
- Do not introduce a UI framework.
- Do not add new product features while doing visual convergence.
- Do not use sample-novel-specific UI logic.

## Implementation Guardrails

- Preserve current API contracts.
- Preserve current content asset model.
- Prefer existing `nf` tokens/classes where possible.
- Add shared primitives only when they reduce duplication across pages.
- Each implementation goal must include screenshots at desktop and mobile widths.
- Product code changes require frontend tests, TypeScript, and build checks.
