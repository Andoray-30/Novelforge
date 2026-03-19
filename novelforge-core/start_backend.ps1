# NovelForge 后端服务启动脚本

Write-Host "Starting NovelForge Backend Service..." -ForegroundColor Green

# 检查是否在正确的目录
if (!(Test-Path ".venv")) {
    Write-Host "Error: .venv directory not found. Please run this script from the novelforge-core directory." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& ".venv\Scripts\Activate.ps1"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to activate virtual environment" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Starting API server on port 8001..." -ForegroundColor Yellow

# 启动API服务器
$env:PYTHONPATH = "$env:PYTHONPATH;$(Get-Location)"
Start-Process python -ArgumentList "-c", "import uvicorn; from novelforge.api import app; uvicorn.run(app, host='0.0.0.0', port=8001, reload=False)"

Write-Host "Backend API is starting on http://localhost:8001" -ForegroundColor Green
Write-Host "Please start the frontend separately by running:" -ForegroundColor Yellow
Write-Host "  cd frontend" -ForegroundColor Yellow
Write-Host "  npm install" -ForegroundColor Yellow
Write-Host "  npm run dev" -ForegroundColor Yellow
Write-Host "" -ForegroundColor Yellow
Write-Host "Press any key to exit..." -ForegroundColor Cyan
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")