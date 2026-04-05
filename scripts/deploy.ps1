# =============================================================================
# deploy.ps1 — Full redeploy script for Gas Reading App
#
# Architecture: React is built and bundled INTO Django.
#               Django (on Azure App Service) serves everything.
#               Oryx handles pip install (SCM_DO_BUILD_DURING_DEPLOYMENT=true).
#               React files go to staticfiles/ via collectstatic (Oryx keeps staticfiles/ in wwwroot).
#
# Usage (run from repo root):
#   .\scripts\deploy.ps1          -> build React + deploy backend (default)
#   .\scripts\deploy.ps1 -SkipBuild  -> skip React build (use existing frontend_build/)
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - Node.js installed (for React build)
#   - Run from repo root: C:\skillUp\AI app\GasReadingApp\
# =============================================================================

param(
    [switch]$SkipBuild
)

# ── Azure resource names ──────────────────────────────────────────────────────
$RESOURCE_GROUP   = "gas-reading-app-rg"
$APP_SERVICE_NAME = "gasreading-backend"
$BACKEND_DIR      = "$PSScriptRoot\..\backend"
$FRONTEND_DIR     = "$PSScriptRoot\..\frontend"

# ── Helpers ──────────────────────────────────────────────────────────────────
function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "    OK $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "    FAILED $msg" -ForegroundColor Red; exit 1 }

# ── Verify Azure login ────────────────────────────────────────────────────────
Write-Step "Checking Azure login..."
$account = az account show --query "name" -o tsv 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Not logged in. Run: az login --use-device-code"
}
Write-OK "Logged in as: $account"

# =============================================================================
# STEP 1 — Build React frontend (unless -SkipBuild)
# =============================================================================
if (-not $SkipBuild) {
    Write-Step "Building React frontend..."
    Push-Location $FRONTEND_DIR

    npm install
    if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed" }

    $env:VITE_API_URL = "https://gasreading-backend.azurewebsites.net/api"
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Fail "React build failed" }
    Write-OK "React built -> frontend/dist/"

    Pop-Location

    Write-Step "Copying frontend build into Django..."
    $destPath = "$BACKEND_DIR\frontend_build"
    if (Test-Path $destPath) { Remove-Item $destPath -Recurse -Force }
    Copy-Item -Path "$FRONTEND_DIR\dist" -Destination $destPath -Recurse
    Write-OK "Copied to backend/frontend_build/"
} else {
    Write-Step "Skipping React build (-SkipBuild flag set)"
    if (-not (Test-Path "$BACKEND_DIR\frontend_build")) {
        Write-Fail "backend/frontend_build/ does not exist. Run without -SkipBuild first."
    }
    Write-OK "Using existing backend/frontend_build/"
}

# =============================================================================
# STEP 2 — Collect Django static files
# =============================================================================
Write-Step "Collecting Django static files..."
Push-Location $BACKEND_DIR

$env:SECRET_KEY = "placeholder-for-collectstatic"
$env:DEBUG = "False"
$env:AZURE_STORAGE_ACCOUNT_NAME = "gasreadingdk2024"
$env:AZURE_BLOB_CONTAINER_NAME = "meter-images"
$env:AZURE_COMMUNICATION_ENDPOINT = "https://gasreading-acs.unitedstates.communication.azure.com"
$env:EMAIL_SENDER_ADDRESS = "placeholder@example.com"

.\venv\Scripts\python manage.py collectstatic --no-input
if ($LASTEXITCODE -ne 0) { Write-Fail "collectstatic failed" }
Write-OK "Static files collected"

# =============================================================================
# STEP 3 — Configure App Service settings
# =============================================================================
Write-Step "Configuring App Service settings..."
az webapp config appsettings set `
    --name $APP_SERVICE_NAME `
    --resource-group $RESOURCE_GROUP `
    --settings "SCM_DO_BUILD_DURING_DEPLOYMENT=true" | Out-Null

az webapp config set `
    --name $APP_SERVICE_NAME `
    --resource-group $RESOURCE_GROUP `
    --startup-file "gunicorn --chdir /home/site/wwwroot config.wsgi:application --workers 1 --timeout 120 --bind 0.0.0.0:8000" | Out-Null

Write-OK "SCM_DO_BUILD_DURING_DEPLOYMENT=true, startup command set"

# =============================================================================
# STEP 4 — Zip and deploy to Azure App Service
# Oryx handles pip install. React files are in staticfiles/ (via collectstatic).
# frontend_build/ is excluded from zip since it's no longer needed at runtime.
# =============================================================================
Write-Step "Creating deployment zip..."
$zipPath = "$env:TEMP\gasreading-backend.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath }

$items = Get-ChildItem -Path . | Where-Object {
    $_.Name -notin @('venv', '__pycache__', 'db.sqlite3', '.env', 'logs', '.python_packages', 'antenv', 'frontend_build')
}
Compress-Archive -Path $items.FullName -DestinationPath $zipPath -Force
Write-OK "Zip created: $zipPath"

Write-Step "Uploading to Azure App Service (Kudu zip deploy - triggers Oryx pip install)..."
az webapp deployment source config-zip `
    --resource-group $RESOURCE_GROUP `
    --name $APP_SERVICE_NAME `
    --src $zipPath

if ($LASTEXITCODE -ne 0) { Write-Fail "Deploy failed" }

# =============================================================================
# STEP 5 — Upload staticfiles via Kudu VFS
# Compress-Archive uses Windows backslash paths which Linux can't extract into
# subdirectories correctly. We upload staticfiles directly via the Kudu REST API
# so WhiteNoise has the correct files when Django starts after Oryx restarts.
# =============================================================================
Write-Step "Uploading staticfiles via Kudu VFS (fixes Windows backslash path issue)..."

$publishCreds = az webapp deployment list-publishing-credentials `
    --name $APP_SERVICE_NAME `
    --resource-group $RESOURCE_GROUP `
    --query "[publishingUserName, publishingPassword]" -o tsv | Out-String
$kuduUser = ($publishCreds -split "`n")[0].Trim()
$kuduPass = ($publishCreds -split "`n")[1].Trim()
$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${kuduUser}:${kuduPass}"))
$kuduBase = "https://$APP_SERVICE_NAME.scm.azurewebsites.net/api/vfs/site/wwwroot"

function Kudu-Upload($localPath, $remotePath) {
    $headers = @{ Authorization = "Basic $base64Auth" }
    $remoteUrl = "$kuduBase/$remotePath"

    # Get ETag if file exists (required for updates)
    try {
        $head = Invoke-WebRequest -Uri $remoteUrl -Method Head -Headers $headers -ErrorAction Stop
        $etag = $head.Headers.ETag
        $headers["If-Match"] = $etag
    } catch { <# new file — no ETag needed #> }

    Invoke-RestMethod -Uri $remoteUrl -Method Put -Headers $headers `
        -InFile $localPath -ContentType "application/octet-stream" | Out-Null
    Write-OK "Uploaded: $remotePath"
}

$staticfilesDir = ".\staticfiles"
Get-ChildItem -Path $staticfilesDir -Recurse -File | ForEach-Object {
    $relativePath = $_.FullName.Substring((Resolve-Path $staticfilesDir).Path.Length + 1).Replace('\', '/')
    Kudu-Upload $_.FullName "staticfiles/$relativePath"
}

Write-Step "Restarting App Service so WhiteNoise picks up new static files..."
az webapp restart --name $APP_SERVICE_NAME --resource-group $RESOURCE_GROUP | Out-Null
Write-OK "Restarted"

Pop-Location

Write-Host ""
Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host "   App: https://$APP_SERVICE_NAME.azurewebsites.net"
