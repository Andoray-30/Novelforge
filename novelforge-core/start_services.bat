@echo off
echo Starting NovelForge Services...

REM 检查是否在正确的目录
if not exist ".venv" (
    echo Error: .venv directory not found. Please run this script from the novelforge-core directory.
    pause
    exit /b 1
)

echo Activating virtual environment...
call .venv\Scripts\activate.bat

if errorlevel 1 (
    echo Error: Failed to activate virtual environment
    pause
    exit /b 1
)

echo Starting API server on port 8001...
start cmd /k "cd /d %~dp0 && python -c \"import uvicorn; from novelforge.api import app; uvicorn.run(app, host='0.0.0.0', port=8001, reload=False)\""

echo Please start the frontend separately by running:
echo cd frontend
echo npm install
echo npm run dev
echo.
echo Backend API is starting on http://localhost:8001
echo Frontend should be started on http://localhost:3000

pause