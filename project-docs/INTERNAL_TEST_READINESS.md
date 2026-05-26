# NovelForge 内测质量总览

Date: 2026-05-25

## Purpose

Goal 14 adds a project-level quality gate for internal testing. The goal is not to beautify the UI, but to answer one practical question after importing a novel:

> Is this project ready for AI writing, and if not, what should be repaired first?

## New Readiness Model

The frontend now builds a `ProjectQualitySummary` from current project assets:

- Chapters:
  - total chapters
  - imported originals
  - AI drafts
  - candidate versions
  - formal body chapters
  - formal prologues
  - extras
  - archived chapters
  - decorative/catalog items
  - overlong segments
- Characters:
  - total characters
  - writable characters
  - low-information characters
- Relationships:
  - total relationships
  - usable relationships
  - tension relationships
  - low-information relationships
  - enriched relationships
  - relationships needing repair
  - top missing signals
- World:
  - world asset count
  - usable world signals
  - rules
  - images/motifs/locations
  - costs/consequences
  - taboos/prohibitions
  - scene potential
- Structure:
  - outline / novel-root count
  - timeline count
- Writing readiness:
  - at least one writable character
  - at least one usable/enriched relationship
  - at least one world signal
  - at least one imported or formal chapter source

## Status Rules

- `ready`: writing gates pass and no obvious repair issues are detected.
- `needs_repair`: writing gates pass, but the project still has thin relationships, low-information characters, candidate clutter, decorative chapters, or weak world facts.
- `insufficient`: at least one writing gate is missing.
- `unknown`: no usable assets are present.

## Current Sample Readiness Notes

Sample/project context from recent validations:

- Project used in Goal 12: `clean_import_20260524_111341`.
- Novel root: `novel_clean_import_20260524_111341`.
- Relationship repair queue was validated before Goal 14:
  - relationships total: 8
  - tension relationships after queue drafts: 7
  - low-information relationships after queue drafts: 3
  - relationship status: `usable`
- Final Goal 12 prologue candidate:
  - length: 1018 chars
  - relationship-driven gate: pass
  - saved as AI draft/candidate, not final canonical prose

Expected Goal 14 summary for this sample should therefore be:

- Chapter quality: likely `needs_repair`, because AI candidates/drafts still need editor cleanup and promotion/archiving.
- Character quality: likely `needs_repair`, because earlier extraction showed uneven character depth.
- Relationship quality: `ready` or `needs_repair`; at least one usable/enriched relationship exists, but some relationships remain low-information.
- World quality: depends on current imported world assets; should be checked for rules, imagery, costs, taboos, and scene potential.
- Writing readiness: should pass if the current project still contains:
  - imported/formal chapter source,
  - at least one writable character,
  - enriched relationship drafts from Goal 12,
  - at least one world signal.

## Manual Attention Before Internal Test

- Use the new quality panel after opening the project.
- If overall status is `insufficient`, do not start internal writing validation yet.
- If overall status is `needs_repair`, writing can begin, but testers should first follow the displayed repair hints:
  - thin relationships: run or use the core relationship repair queue;
  - too many AI drafts/candidates: open editor and archive or promote candidates;
  - chapter structure issues: inspect imported originals in editor filters;
  - low-information characters: plan a character enrichment pass;
  - weak world facts: add rules, costs, taboos, and scene-ready imagery.

## Verification Added In Goal 14

- `project-quality-summary` helper unit tests cover:
  - empty project -> `unknown`
  - chapter state counts
  - `ready` gate
  - `needs_repair` gate
  - `insufficient` gate
  - enriched relationship usability
- The main workspace displays a compact quality overview in chat mode.
- The dashboard displays the same quality overview with more detail and action buttons.

## Goal 15 Deployment Readiness Notes

Date: 2026-05-26

### Required Backend Environment

Use `novelforge-core/.env.example` as the template. For internal/public deployment, the minimum required settings are:

- `OPENAI_API_KEY`: server-side provider key. Do not put this in frontend env.
- `OPENAI_BASE_URL`: OpenAI-compatible endpoint, for example `https://newapi.sync-api.xyz/v1`.
- `OPENAI_MODEL`, `NOVELFORGE_FAST_MODEL`, `NOVELFORGE_PRO_MODEL`: backend model mapping for Fast/Pro mode.
- `NOVELFORGE_PUBLIC_DEPLOYMENT=true`: enables strict startup validation.
- `NOVELFORGE_ADMIN_PASSWORD`: single-admin login password.
- `NOVELFORGE_SESSION_SECRET`: long random string for HttpOnly session cookie signing.
- `FRONTEND_ORIGIN`: real frontend origin in deployment. In public mode this must not remain `localhost`.
- `NOVELFORGE_ALLOW_RUNTIME_OPENAI_OVERRIDES=false`: prevents browser-provided API keys/base URLs/models from replacing server config.
- `NOVELFORGE_DATA_DIR`: persistent data root.
- `STORAGE_TYPE=content_db` and `USE_CONTENT_DATABASE=true`: recommended deployment storage mode.
- `CONTENT_DATABASE_PATH`, `DATABASE_PATH`, `FILE_STORAGE_DIR`: explicit persistent paths under the data root.

Startup validation now checks:

- admin password,
- session secret,
- provider key,
- non-localhost frontend origin in public mode,
- content DB storage mode,
- data directory and DB parent directory write access.

### Frontend Environment

The frontend must only know where the backend is:

- `NEXT_PUBLIC_NOVELFORGE_URL=https://your-backend-domain.example`

Do not expose `OPENAI_API_KEY`, NewAPI keys, or provider base URLs as frontend public variables.

### Data Directory Layout

Recommended deployment layout:

```text
novelforge-core/data/
  novelforge_content.db     # content library: novels, chapters, characters, worlds, timelines, relationships
  novelforge.db             # generic storage backend, if used
  file_storage/             # conversations, task state, and file-backed runtime data
```

Depending on configuration, conversations and task records may live in `file_storage/`, while structured content assets live in `novelforge_content.db`.

### Backup / Restore

Before internal testing or upgrades:

1. Stop backend writes if possible.
2. Copy the whole `NOVELFORGE_DATA_DIR`.
3. Store the copy with a timestamp, for example `backups/novelforge-data-20260526/`.
4. Restore by stopping services and replacing the current data directory with the backup copy.

SQLite backup can also be done by copying:

- `CONTENT_DATABASE_PATH`
- `DATABASE_PATH`
- `FILE_STORAGE_DIR`

The whole data directory backup is safer because it includes conversations and task traces.

### Clean Workspace Policy

- Root sample text such as `超时空辉夜姬.txt` is ignored by git and must not be committed.
- Temporary AI-assisted pytest folders are ignored.
- Main workspace session list hides obvious mock/smoke/Goal validation sessions in the frontend. This is a display cleanup only; it does not physically delete real user data.
- To start a clean internal-test project, create a new project/session and import from the upload flow instead of relying on root sample files.

### Minimal Internal Smoke

1. Start backend and verify:
   - `GET /health` returns healthy.
   - `POST /api/auth/login` succeeds when auth is enabled.
2. Start frontend and log in.
3. Open the main workspace.
4. Confirm the project quality overview is visible.
5. Open `/editor`.
6. Start a short AI writing request or a controlled mock writing request.
7. Save the result as an AI draft.
8. Reopen editor and confirm the saved draft appears in the content library.

### Common Errors

- Missing public config: backend startup fails with a Chinese readable `公开部署配置不完整` message.
- Provider `500`, timeout, or connection reset: frontend chat shows a readable retry hint and does not auto-save duplicate content.
- Cookie login fails in deployment: check `FRONTEND_ORIGIN`, HTTPS, and reverse proxy cookie forwarding.
- Data appears missing after deployment: check `NOVELFORGE_DATA_DIR`, `CONTENT_DATABASE_PATH`, `STORAGE_TYPE`, and `USE_CONTENT_DATABASE`.
