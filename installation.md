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

Minimal example:

```env
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
OPENAI_MODEL=Pro/deepseek-ai/DeepSeek-V3.2
```

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
