# NovelForge UI Audit Current

Date: 2026-05-27

Scope: current product UI evidence collection for the main pages and critical states. Screenshots were captured with a temporary mock API and system Chrome against the real Next.js frontend. The fixture uses invented project data and does not include sample novel text, secrets, or production data.

Screenshots live in [project-docs/screenshots/ui-audit-current/](./screenshots/ui-audit-current/).

## Capture Inventory

| Area | Screenshot |
| --- | --- |
| Login | `login-default-light-desktop.png`, `login-default-dark-mobile.png` |
| Workspace default | `workspace-default-light-desktop.png`, `workspace-default-dark-desktop.png`, `workspace-default-light-tablet.png`, `workspace-default-dark-mobile.png` |
| Workspace trace | `workspace-trace-light-desktop.png`, `workspace-trace-dark-mobile.png` |
| Workspace save asset | `workspace-save-card-light-desktop.png` |
| Workspace relationship repair queue | `workspace-relationship-queue-light-desktop.png` |
| Workspace empty / insufficient | `workspace-empty-light-desktop.png`, `workspace-empty-dark-mobile.png` |
| Editor default | `editor-default-light-desktop.png` |
| Editor candidate management | `editor-candidate-light-desktop.png` |
| Editor previous snapshot | `editor-snapshot-light-desktop.png`, `editor-snapshot-dark-mobile.png` |
| Extract default | `extract-default-light-desktop.png` |
| Extract importing | `extract-importing-light-desktop.png` |
| Extract completed / diagnostics | `extract-diagnostics-light-desktop.png`, `extract-diagnostics-dark-mobile.png` |
| Characters | `characters-light-desktop.png`, `characters-dark-mobile.png` |
| World | `world-light-desktop.png`, `world-dark-mobile.png` |
| Dashboard | `dashboard-light-desktop.png`, `dashboard-dark-mobile.png` |
| Settings | `settings-light-desktop.png`, `settings-dark-mobile.png` |
| Error / empty state | `error-empty-state-light-desktop.png` |

## Page Audit

### Login

Screenshots:
- [login-default-light-desktop.png](./screenshots/ui-audit-current/login-default-light-desktop.png)
- [login-default-dark-mobile.png](./screenshots/ui-audit-current/login-default-dark-mobile.png)

Current rating: **good**

The login page is simple, focused, and close to a mature product surface. It is visually consistent with the newer dark theme and has low information density. Mobile is usable, though it still reads more like a private admin gate than a polished public entry.

Keep: centered form, minimal copy, clear admin-only mode.

Improve later: add a calmer deployment hint and password error state polish.

### Workspace Default

Screenshots:
- [workspace-default-light-desktop.png](./screenshots/ui-audit-current/workspace-default-light-desktop.png)
- [workspace-default-dark-desktop.png](./screenshots/ui-audit-current/workspace-default-dark-desktop.png)
- [workspace-default-light-tablet.png](./screenshots/ui-audit-current/workspace-default-light-tablet.png)
- [workspace-default-dark-mobile.png](./screenshots/ui-audit-current/workspace-default-dark-mobile.png)

Current rating: **acceptable**

The main workspace is the page that most clearly points toward the desired ChatGPT/Codex-like product direction. The chat area is central, the side project list is usable, and the right context rail gives useful project status. However, the page still feels busy because the left app nav, project sidebar, top project selector, mode buttons, task icon, context rail, prompt chips, and composer all compete at once.

Information density: medium-high on desktop, high on mobile.

Product maturity: acceptable on desktop; mobile is mostly "usable" rather than "good".

Hide/fold/reorganize:
- Put project status and focused assets behind a compact drawer or panel on tablet/mobile.
- Collapse prompt chips when vertical space is limited.
- Reduce duplicated project identity between topbar, sidebar, and page heading.

Keep:
- Chat-first layout.
- Project quality summary concept.
- Explicit save confirmation card.
- Fast/Pro switch in composer.

### Workspace Trace Expanded

Screenshots:
- [workspace-trace-light-desktop.png](./screenshots/ui-audit-current/workspace-trace-light-desktop.png)
- [workspace-trace-dark-mobile.png](./screenshots/ui-audit-current/workspace-trace-dark-mobile.png)

Current rating: **acceptable**

The trace card is now readable and no longer dumps raw model internals. It gives useful evidence: assets read, snippets used, tool calls, and relationship diagnostics. The expanded state is still too tall and becomes a debugging panel inside the writing flow.

Information density: high.

Product maturity: acceptable for an internal test build, weak for public first impression.

Hide/fold/reorganize:
- Default to one-line summary plus "查看依据".
- Move tool calls under an advanced disclosure.
- Show relationship quality as a compact warning card, not a full grid by default.

Keep:
- "本轮写作依据" wording.
- Asset/snippet trace grouped by category.
- Enhanced relationship indicator.

### Workspace Save Asset Card

Screenshot:
- [workspace-save-card-light-desktop.png](./screenshots/ui-audit-current/workspace-save-card-light-desktop.png)

Current rating: **acceptable**

The save card communicates the core product rule: AI suggests, user confirms. This is important and should stay. It still visually blends with surrounding assistant content and could use clearer hierarchy between "candidate", "formal", "overwrite", and "open editor".

Information density: medium.

Product maturity: acceptable.

Hide/fold/reorganize:
- Keep only title, destination, preview toggle, and primary action visible by default.
- Put impact details under a disclosure.

Keep:
- Explicit confirmation.
- Destination selector.
- "查看预览与影响" disclosure.

### Workspace Relationship Repair Queue

Screenshot:
- [workspace-relationship-queue-light-desktop.png](./screenshots/ui-audit-current/workspace-relationship-queue-light-desktop.png)

Current rating: **weak**

The relationship queue proves the workflow exists, but it still reads like an engineering diagnostic card rather than a writer-facing repair suggestion. Labels such as `emotional_tension`, `arc`, and `scene_potential` are useful internally but too raw for normal users.

Information density: high.

Product maturity: weak.

Hide/fold/reorganize:
- Translate missing signal keys into writer-facing Chinese labels.
- Put queue score and technical reasons behind "为什么建议修复".
- Primary action should be "保存为关系补强草稿"; update original relationship should be secondary and visually safer.

Keep:
- Before/after relationship quality comparison.
- Save draft / update original / skip workflow.

### Workspace Empty / Insufficient Project

Screenshots:
- [workspace-empty-light-desktop.png](./screenshots/ui-audit-current/workspace-empty-light-desktop.png)
- [workspace-empty-dark-mobile.png](./screenshots/ui-audit-current/workspace-empty-dark-mobile.png)

Current rating: **bad**

The empty project state currently still shows a chat welcome plus an "AI 正在思考..." style placeholder. That implies the assistant is doing something even when there is no usable context. This is confusing and weakens the first-run experience.

Information density: low, but the wrong information is emphasized.

Product maturity: bad for onboarding.

Hide/fold/reorganize:
- Replace the thinking placeholder with a first-run action panel.
- Primary actions: "导入小说", "新建角色", "开始空白创作".
- Right context rail should say "暂无资产" and explain what to do next.

Keep:
- Chat composer available, but with clear context warning.

### Editor Default

Screenshot:
- [editor-default-light-desktop.png](./screenshots/ui-audit-current/editor-default-light-desktop.png)

Current rating: **acceptable**

The editor has a real workflow now: chapter directory, filters, text area, metadata inspector. It is usable for internal testing. It still feels like a management console more than a writing environment because the filter chips, inspector, stats, and action buttons surround the text heavily.

Information density: high.

Product maturity: acceptable for asset management, weak for immersive writing.

Hide/fold/reorganize:
- Add a future focus writing mode.
- Collapse inspector by default on smaller screens.
- Move low-frequency metadata to a details section.

Keep:
- Directory sorting and filters.
- Chapter status panel.
- Save and refresh actions.

### Editor Candidate Management

Screenshot:
- [editor-candidate-light-desktop.png](./screenshots/ui-audit-current/editor-candidate-light-desktop.png)

Current rating: **acceptable**

Candidate management is visible and understandable. The page supports promotion and archival in principle. The main weakness is that the candidate controls are pushed into a narrow inspector, so they are easy to miss.

Information density: high.

Product maturity: acceptable.

Hide/fold/reorganize:
- Promote candidate actions should appear as a compact banner above the text when a candidate is selected.
- Keep destructive/archive action visually secondary.

Keep:
- Metadata-only promotion rule.
- Archive without physical deletion.

### Editor Previous Snapshot

Screenshots:
- [editor-snapshot-light-desktop.png](./screenshots/ui-audit-current/editor-snapshot-light-desktop.png)
- [editor-snapshot-dark-mobile.png](./screenshots/ui-audit-current/editor-snapshot-dark-mobile.png)

Current rating: **weak**

The previous snapshot feature exists, but the screenshot evidence shows that it is hard to reach and mobile visibility is poor. On mobile the editor prioritizes hero controls and content, while snapshot recovery remains buried.

Information density: high.

Product maturity: weak.

Hide/fold/reorganize:
- Surface "可恢复上一版" as a visible status chip near the selected chapter title.
- Open restore details in a modal or bottom sheet.
- Show old title, old time, and short preview first; raw extracted data should be advanced.

Keep:
- Single-layer recovery model.
- Confirmation before restore.

### Extract Default

Screenshot:
- [extract-default-light-desktop.png](./screenshots/ui-audit-current/extract-default-light-desktop.png)

Current rating: **weak**

The extract page has the right functional pieces, but visually it is still closer to a dramatic landing section than an operational import tool. The large title and upload area dominate the page, while the user's actual decision flow is not structured as a step-by-step import.

Information density: medium.

Product maturity: weak.

Hide/fold/reorganize:
- Convert to an import wizard: choose file, confirm options, run extraction, review diagnostics.
- Reduce hero styling.
- Keep project target and quality expectations visible.

Keep:
- Drag-and-drop upload zone.
- File extension support list.

### Extract Importing

Screenshot:
- [extract-importing-light-desktop.png](./screenshots/ui-audit-current/extract-importing-light-desktop.png)

Current rating: **acceptable**

The extraction progress state is understandable and the task center popup helps. The page still shows the upload affordance while extraction is in progress, which can make the state feel ambiguous.

Information density: medium.

Product maturity: acceptable.

Hide/fold/reorganize:
- Disable or visually subordinate upload while a current import is running.
- Put stage progress in a checklist rather than a single bar.

Keep:
- Persistent task popup.
- Clear cancel action.

### Extract Completed / Diagnostics

Screenshots:
- [extract-diagnostics-light-desktop.png](./screenshots/ui-audit-current/extract-diagnostics-light-desktop.png)
- [extract-diagnostics-dark-mobile.png](./screenshots/ui-audit-current/extract-diagnostics-dark-mobile.png)

Current rating: **weak**

Diagnostics exist and are valuable, but the result is buried below the upload surface. On mobile, the diagnostic result is hard to scan because the upload block consumes most of the viewport.

Information density: high after scrolling.

Product maturity: weak.

Hide/fold/reorganize:
- After completion, swap the main panel from upload-first to results-first.
- Show status, counts, and top issues above the fold.
- Advanced diagnostics should be collapsed.

Keep:
- Quality issue list.
- Candidate counts and failed chapter diagnostics.

### Characters

Screenshots:
- [characters-light-desktop.png](./screenshots/ui-audit-current/characters-light-desktop.png)
- [characters-dark-mobile.png](./screenshots/ui-audit-current/characters-dark-mobile.png)

Current rating: **acceptable**

The characters page has a strong visual identity and feels more product-like than many other pages. It still prioritizes style over content utility: cards look attractive, but personality, desire, conflict, evidence, and relationship hooks are not prominent enough for actual writing use.

Information density: medium.

Product maturity: acceptable visually, weak as a writing reference.

Hide/fold/reorganize:
- Convert character cards into reusable asset cards with clear tabs: personality, motivation, relationship hooks, evidence.
- Put graph/network behind a secondary view, not as a primary button if the graph is not yet strong.

Keep:
- Archive/library metaphor.
- Search and view switch.

### World

Screenshots:
- [world-light-desktop.png](./screenshots/ui-audit-current/world-light-desktop.png)
- [world-dark-mobile.png](./screenshots/ui-audit-current/world-dark-mobile.png)

Current rating: **bad**

The world page is the most visually inconsistent page in this audit. It uses a very different dark/cyan style, and the event card in the timeline has serious contrast/readability problems in the captured light desktop state. The information architecture is promising, but the execution feels disconnected from the main workspace.

Information density: medium.

Product maturity: bad due to contrast and visual mismatch.

Hide/fold/reorganize:
- Move world page to the shared `nf` theme.
- Replace oversized neon header with quiet asset library header.
- Fix timeline/event card contrast before internal test.

Keep:
- Sections for history, locations, culture, rules.
- Current world context copy.

### Dashboard / Project Dashboard

Screenshots:
- [dashboard-light-desktop.png](./screenshots/ui-audit-current/dashboard-light-desktop.png)
- [dashboard-dark-mobile.png](./screenshots/ui-audit-current/dashboard-dark-mobile.png)

Current rating: **acceptable**

The dashboard is useful for asset overview and recent activity. It is not as central to the first internal test path as workspace/editor/extract. Mobile looks functional, but the dashboard should not compete with the chat workspace as the primary landing experience.

Information density: medium-high.

Product maturity: acceptable.

Hide/fold/reorganize:
- Treat dashboard as project overview, not the main creative surface.
- Hide experimental analytics until backed by reliable metrics.

Keep:
- Recent assets.
- Project stats.

### Settings

Screenshots:
- [settings-light-desktop.png](./screenshots/ui-audit-current/settings-light-desktop.png)
- [settings-dark-mobile.png](./screenshots/ui-audit-current/settings-dark-mobile.png)

Current rating: **acceptable**

Settings is serviceable and has practical structure. It still contains too many deployment/technical concepts near the surface for a single-admin public version.

Information density: medium.

Product maturity: acceptable.

Hide/fold/reorganize:
- Split admin model routing from user-facing writing mode preferences.
- Make Fast/Pro mapping a small admin panel section.
- Hide raw provider configuration from ordinary writing flow.

Keep:
- Runtime status.
- Public deployment restrictions.

### Error / Empty State

Screenshot:
- [error-empty-state-light-desktop.png](./screenshots/ui-audit-current/error-empty-state-light-desktop.png)

Current rating: **weak**

The empty world state renders, but it does not yet explain the next best action clearly enough. Empty states should be conversion points into the core workflow, not just blank confirmations that nothing exists.

Information density: low.

Product maturity: weak.

Hide/fold/reorganize:
- Add one primary action and one secondary action per empty state.
- Reuse the same empty-state pattern across characters/world/editor/extract.

Keep:
- Clear distinction between "no data" and "loading".

## Global Design Problems

Most product-like page:
- Login, workspace default, and characters are closest to a coherent product direction.

Most visually fractured pages:
- World is the most fractured due to neon styling and contrast bugs.
- Extract still feels like a standalone hero page rather than part of the workspace system.

Biggest first-impression problems:
- The app mixes several visual languages: quiet `nf` workspace, neon extract/world, card-heavy archive pages.
- Empty project state shows an assistant thinking placeholder instead of clear onboarding.
- Technical diagnostics sometimes appear too close to the writing flow.

Biggest mobile problems:
- Workspace mobile is usable but crowded; context and diagnostics need drawer/bottom sheet behavior.
- Editor mobile makes recovery/candidate management hard to discover.
- Extract mobile keeps upload UI above diagnostics, making completed results feel buried.

Biggest creative-experience problems:
- Editor is still an asset console, not yet a focused writing surface.
- Character cards do not foreground personality, desire, contradiction, and relationship hooks.
- Relationship repair uses internal signal names that are useful to engineers but not emotionally meaningful to writers.

Pages suitable for direct migration to shared `nf` theme:
- Workspace
- Editor
- Settings
- Dashboard, after reducing analytics emphasis

Pages needing information architecture redesign:
- Extract should become an import/review wizard.
- World should become a world asset library with consistent sections and readable cards.
- Characters should become a writer-facing dossier library.
- Empty states should be redesigned globally.

## Initial Refactor Recommendations

Main workspace:
- Keep the multi-column desktop structure, but reduce duplication and make right-side context collapsible.
- Tablet and mobile should use drawers/bottom sheets for project context, focused assets, and trace.

Editor:
- Add a future focus writing mode.
- Keep current asset-management mode for candidate/version workflows.
- Surface candidate and previous snapshot state near the selected chapter title, not only in the inspector.

Extract:
- Redesign as a four-step import wizard: upload, configure, extract, review diagnostics.
- After completion, make diagnostics/results the primary page state.

Asset pages:
- Characters and world should move toward a shared "project library card" system.
- Cards should emphasize writing utility: motivation, conflict, evidence, relationship hooks, scene potential.

Mobile:
- Standardize on drawer/bottom sheet for secondary panels.
- Do not force desktop sidebars into mobile.
- Keep composer and primary task visible without horizontal overflow.

Diagnostics:
- Default-hide raw diagnostics, tool calls, queue scores, and internal signal keys.
- Show writer-facing summaries first, with advanced details behind disclosure.

## Verification Notes

- Browser: system Chrome headless via DevTools Protocol.
- Frontend: real Next.js app on `localhost:3010`.
- API: temporary mock API on `127.0.0.1:8001`, removed after capture.
- Screenshot count: 29 PNG files.
- Sizes verified: desktop `1440x900`, tablet `768x900`, mobile `390x900`.
- No product code was changed in this audit pass, so product tests were not run.
