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

