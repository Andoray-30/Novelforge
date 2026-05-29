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
Do not commit `.env` or real provider keys.

Local development example:

```env
OPENAI_API_KEY=replace-with-your-server-key
OPENAI_BASE_URL=https://fast-newapi.sync-api.xyz:8848/v1
OPENAI_MODEL=gemini-3.5-flash
NOVELFORGE_FAST_MODEL=gemini-3.5-flash
NOVELFORGE_PRO_MODEL=gemini-3.1-pro-preview
FRONTEND_ORIGIN=http://localhost:3010
NOVELFORGE_DATA_DIR=./data
STORAGE_TYPE=content_db
USE_CONTENT_DATABASE=true
```

Internal/public deployment also requires a single-admin password and session secret:

```env
NOVELFORGE_PUBLIC_DEPLOYMENT=true
NOVELFORGE_AUTH_REQUIRED=true
NOVELFORGE_ADMIN_PASSWORD=replace-with-a-strong-password
NOVELFORGE_SESSION_SECRET=replace-with-a-long-random-string
FRONTEND_ORIGIN=https://your-frontend-domain.example
NOVELFORGE_ALLOW_RUNTIME_OPENAI_OVERRIDES=false
```

Generate a session secret locally:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

In public deployment, the browser-side API key override is disabled and all protected APIs require the admin login cookie.
The backend also performs startup checks for `NOVELFORGE_ADMIN_PASSWORD`, `NOVELFORGE_SESSION_SECRET`, `OPENAI_API_KEY`, `FRONTEND_ORIGIN`, `NOVELFORGE_DATA_DIR`, and content database storage.

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
