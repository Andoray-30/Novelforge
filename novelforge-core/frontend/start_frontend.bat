@echo off
echo Starting NovelForge Frontend...

REM 检查是否在正确的目录
if not exist "package.json" (
    echo Error: package.json not found. Please run this script from the frontend directory.
    pause
    exit /b 1
)

echo Installing dependencies...
npm install

if errorlevel 1 (
    echo Error: Failed to install dependencies
    pause
    exit /b 1
)

echo Starting frontend on port 3000...
npm run dev

pause