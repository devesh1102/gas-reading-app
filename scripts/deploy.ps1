# =============================================================================
# deploy.ps1 — Full redeploy script for Gas Reading App
#
# Usage:
#   .\scripts\deploy.ps1              → deploy both backend + frontend
#   .\scripts\deploy.ps1 -Backend     → deploy backend only
#   .\scripts\deploy.ps1 -Frontend    → deploy frontend only
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - Node.js installed (for React build)
#   - Run from repo root: C:\skillUp\AI app\GasReadingApp\
# =============================================================================

param(
    [switch]$Backend,
    [switch]$Frontend
)

# If neither flag passed, deploy both
if (-not $Backend -and -not $Frontend) {
    $Backend  = $true
    $Frontend = $true
}

# ── Azure resource names (change these if you rename anything) ──────────────
$RESOURCE_GROUP   = "gas-reading-app-rg"
$APP_SERVICE_NAME = "gasreading-backend"
$STATIC_WEB_APP   = "gasreading-frontend"
$BACKEND_DIR      = "$PSScriptRoot\..\backend"
$FRONTEND_DIR     = "$PSScriptRoot\..\frontend"

# ── Helpers ──────────────────────────────────────────────────────────────────
function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "    ✅ $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "    ❌ $msg" -ForegroundColor Red; exit 1 }

# ── Verify Azure login ────────────────────────────────────────────────────────
Write-Step "Checking Azure login..."
$account = az account show --query "name" -o tsv 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Not logged in. Run: az login --use-device-code"
}
Write-OK "Logged in as: $account"

# =============================================================================
# BACKEND DEPLOY
# =============================================================================
if ($Backend) {
    Write-Step "Deploying Django backend to App Service: $APP_SERVICE_NAME"

    # 1. Collect static files (Django admin CSS/JS → staticfiles/)
    Write-Step "Collecting static files..."
    Push-Location $BACKEND_DIR
    .\venv\Scripts\python manage.py collectstatic --no-input
    if ($LASTEXITCODE -ne 0) { Write-Fail "collectstatic failed" }
    Write-OK "Static files collected"

    # 2. Zip the backend (excluding venv — App Service installs from requirements.txt)
    Write-Step "Creating deployment zip..."
    $zipPath = "$env:TEMP\gasreading-backend.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath }

    # Compress everything except venv, __pycache__, .env, db.sqlite3
    $items = Get-ChildItem -Path . | Where-Object {
        $_.Name -notin @('venv', '__pycache__', 'db.sqlite3', '.env')
    }
    Compress-Archive -Path $items.FullName -DestinationPath $zipPath -Force
    Write-OK "Zip created: $zipPath"

    # 3. Deploy zip to App Service
    # az webapp deploy uploads the zip — App Service extracts it, installs requirements.txt,
    # then runs startup.sh (our gunicorn command)
    Write-Step "Uploading to Azure App Service..."
    az webapp deploy `
        --resource-group $RESOURCE_GROUP `
        --name $APP_SERVICE_NAME `
        --src-path $zipPath `
        --type zip

    if ($LASTEXITCODE -ne 0) { Write-Fail "Backend deploy failed" }
    Write-OK "Backend deployed → https://$APP_SERVICE_NAME.azurewebsites.net"
    Pop-Location
}

# =============================================================================
# FRONTEND DEPLOY
# =============================================================================
if ($Frontend) {
    Write-Step "Deploying React frontend to Static Web App: $STATIC_WEB_APP"

    Push-Location $FRONTEND_DIR

    # 1. Install dependencies (in case package.json changed)
    Write-Step "Installing npm dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed" }

    # 2. Build React for production
    # Vite reads .env and bakes VITE_API_URL into the bundle at build time
    Write-Step "Building React app..."
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Fail "React build failed" }
    Write-OK "React built → dist/"

    # 3. Deploy dist/ to Azure Static Web Apps using SWA CLI
    # Static Web Apps is Azure's free hosting for static sites — CDN-backed, HTTPS auto-configured
    Write-Step "Deploying to Azure Static Web Apps..."
    $token = az staticwebapp secrets list `
        --name $STATIC_WEB_APP `
        --resource-group $RESOURCE_GROUP `
        --query "properties.apiKey" -o tsv

    npx @azure/static-web-apps-cli deploy ./dist `
        --deployment-token $token `
        --env production

    if ($LASTEXITCODE -ne 0) { Write-Fail "Frontend deploy failed" }
    Write-OK "Frontend deployed!"
    Pop-Location
}

Write-Host "`n🚀 Deployment complete!" -ForegroundColor Green
Write-Host "   Backend:  https://$APP_SERVICE_NAME.azurewebsites.net"
Write-Host "   Frontend: check Azure portal for Static Web App URL"
