# NovelForge

NovelForge is a novel analysis and content-generation workspace.

This repository focuses on extracting characters, world settings, timelines, and relationship graphs from long-form fiction, then exporting structured assets for downstream creation tools.

## Workspace Structure

- `novelforge-core/`: Main backend and frontend project (active development)
- `project-docs/`: Planning and progress documents
- `SillyTavern/`: Upstream dependency workspace for compatibility testing
- `installation.md`: Quick setup guide for this repository

## What This Project Does

- Extracts character profiles from text
- Builds world-setting and timeline knowledge
- Generates relationship networks
- Supports AI-assisted writing workflows
- Exports data in formats compatible with roleplay and content tools

## Quick Start

### 1) Backend

```powershell
cd novelforge-core
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
uvicorn novelforge.api.main:app --reload --host 0.0.0.0 --port 8000
```

### 2) Frontend (optional)

```powershell
cd novelforge-core\frontend
npm install
npm run dev
```

### 3) Open API Docs

- Backend: http://localhost:8000
- Swagger: http://localhost:8000/docs

## Notes

- Runtime data and temporary tool directories are intentionally excluded from version control.
- Keep repository-level docs focused on NovelForge itself; avoid mixing unrelated plugin or agent instructions.

## More Documentation

- Core backend documentation: `novelforge-core/README.md`
- Project plan: `project-docs/IMPLEMENTATION_PLAN.md`
- Progress tracking: `project-docs/PROGRESS.md`
