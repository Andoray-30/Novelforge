# NovelForge Installation Guide

This guide installs and runs the local NovelForge workspace on Windows.

## Prerequisites

- Python 3.10+
- Node.js 18+
- Git
- PowerShell

## 1) Clone Repository

```powershell
git clone https://github.com/Andoray-30/Novelforge.git
cd Novelforge
```

## 2) Setup Backend

```powershell
cd novelforge-core
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -e .
```

If you need developer tools:

```powershell
pip install -e ".[dev]"
```

## 3) Configure Environment

Create `novelforge-core/.env` and fill in your provider settings.
You can start from `novelforge-core/.env.example`.

Minimal example:

```env
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://newapi.sync-api.xyz/v1
OPENAI_MODEL=Pro/deepseek-ai/DeepSeek-V3.2
STORAGE_TYPE=content_db
USE_CONTENT_DATABASE=true
```

Public deployment also requires:

```env
NOVELFORGE_PUBLIC_DEPLOYMENT=true
NOVELFORGE_ADMIN_PASSWORD=change-this-password
NOVELFORGE_SESSION_SECRET=replace-with-a-long-random-string
FRONTEND_ORIGIN=https://your-frontend-domain.example
NOVELFORGE_ALLOW_RUNTIME_OPENAI_OVERRIDES=false
```

In public deployment, the browser-side API key override is disabled and all protected APIs require the admin login cookie.

Data should be persistent. Set `NOVELFORGE_DATA_DIR`, `CONTENT_DATABASE_PATH`, `DATABASE_PATH`, and `FILE_STORAGE_DIR` to a directory that survives restarts. Back up the whole data directory before upgrades.

## 4) Start Backend

```powershell
cd novelforge-core
.\.venv\Scripts\Activate.ps1
uvicorn novelforge.api.main:app --reload --host 0.0.0.0 --port 8000
```

Check health/docs:

- http://localhost:8000/health
- http://localhost:8000/docs

## 5) Setup Frontend (Optional)

```powershell
cd novelforge-core\frontend
npm install
npm run dev
```

Frontend default:

- http://localhost:3000

## 6) Common Test Commands

```powershell
cd novelforge-core
.\.venv\Scripts\Activate.ps1
python test_text_processing.py
pytest -v
```

## 7) Common Startup Scripts

- `novelforge-core/start_backend.ps1`
- `novelforge-core/start_services.bat`
- `novelforge-core/frontend/start_frontend.bat`

## Cleanup Notes

This repository may generate temporary directories during AI-assisted development.
They should not be committed. Check `.gitignore` and keep runtime or agent artifacts out of commits.
Root sample novels and real API keys must also stay out of git.
