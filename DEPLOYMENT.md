# Deployment Guide — Gas Reading App

## Architecture

React (frontend) and Django (backend) are deployed together as a single Azure App Service.
Django serves the React SPA alongside the REST API.

```
Browser
  └── https://gasreading-backend.azurewebsites.net
        ├── /api/*          → Django REST API
        ├── /admin/         → Django admin
        ├── /static/assets/ → React JS/CSS (served by WhiteNoise)
        └── /*              → React index.html (SPA catch-all)
```

**Azure resources:**
| Resource | Name |
|---|---|
| App Service | `gasreading-backend` |
| Resource Group | `gas-reading-app-rg` |
| PostgreSQL | `gasreading-db-v2.postgres.database.azure.com` |
| Key Vault | secrets: `DJANGO-SECRET-KEY`, `DB-PASSWORD` |
| Blob Storage | `gasreadingdk2024` / container `meter-images` |
| Communication Services | `gasreading-acs` (OTP emails) |

---

## How static files work

```
frontend/src/
    └── npm run build
            └── frontend/dist/          (Vite output, base: '/static/')
                    └── copy to backend/frontend_build/
                            └── manage.py collectstatic
                                    └── backend/staticfiles/   ← deployed to Azure
                                            ├── index.html
                                            ├── assets/index-*.js
                                            ├── assets/index-*.css
                                            ├── admin/          (Django admin)
                                            └── rest_framework/ (DRF browsable API)
```

WhiteNoise middleware serves everything in `staticfiles/` at `/static/`.
`WHITENOISE_ROOT = STATIC_ROOT` additionally serves `index.html` at `/` for the SPA.

**Key setting** — `vite.config.js` must have `base: '/static/'` so built assets reference
`/static/assets/...` (matching Django's `STATIC_URL`).

---

## Prerequisites

- Azure CLI installed and logged in: `az login`
- Node.js installed (for React build)
- Python venv set up: `backend/venv/`
- Run all commands from repo root: `C:\skillUp\AI app\GasReadingApp\`

---

## Full deployment (React + backend)

```powershell
.\scripts\deploy.ps1
```

This does:
1. `npm install` + `npm run build` in `frontend/` (with `VITE_API_URL` set)
2. Copies `frontend/dist/` → `backend/frontend_build/`
3. Runs `collectstatic` → copies React files into `backend/staticfiles/`
4. Sets App Service config: `SCM_DO_BUILD_DURING_DEPLOYMENT=true`
5. Zips backend (excluding `venv`, `frontend_build`, `__pycache__`, etc.)
6. Uploads zip via Kudu (`az webapp deployment source config-zip`)
7. Oryx installs pip packages on Azure (~10 minutes)

---

## Backend-only deployment (no frontend changes)

```powershell
.\scripts\deploy.ps1 -SkipBuild
```

Skips `npm install`/`npm run build`. Uses existing `backend/frontend_build/`.
Still runs `collectstatic` and redeploys the full backend zip.

---

## How Oryx build works on Azure

When `SCM_DO_BUILD_DURING_DEPLOYMENT=true`:

1. Kudu receives the zip and extracts it to `/tmp/<hash>/`
2. Oryx detects Python, reads `requirements.txt`
3. Oryx installs packages into `antenv/` virtual environment
4. Oryx compresses the result to `output.tar.zst` in wwwroot
5. At startup, Oryx extracts `output.tar.zst` to activate the virtual environment

**Important:** Source files (`config/`, `staticfiles/`, etc.) live in
`/home/site/wwwroot/`. The `output.tar.zst` contains only pip packages.

---

## Startup command

```
gunicorn --chdir /home/site/wwwroot config.wsgi:application --workers 1 --timeout 120 --bind 0.0.0.0:8000
```

Set via App Service config (done automatically by `deploy.ps1`).
`--chdir /home/site/wwwroot` ensures Django finds `config/` as a Python package.

---

## Database migrations

Migrations are **not** run automatically on deploy. Run manually when needed:

```bash
# Via Azure App Service SSH (Kudu console)
# https://gasreading-backend.scm.azurewebsites.net/webssh/host

cd /home/site/wwwroot
python manage.py migrate
```

Or via GitHub Actions (see `.github/workflows/`).

---

## Environment variables / secrets

All secrets are stored in Azure Key Vault. The app fetches them at startup via
Managed Identity (no credentials needed in App Service config).

| Secret name (Key Vault) | Purpose |
|---|---|
| `DJANGO-SECRET-KEY` | Django secret key |
| `DB-PASSWORD` | PostgreSQL password |

App Service app settings (non-secret):
| Setting | Value |
|---|---|
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` |
| `AZURE_KEYVAULT_URL` | Key Vault URL |
| `AZURE_STORAGE_ACCOUNT_NAME` | `gasreadingdk2024` |
| `AZURE_BLOB_CONTAINER_NAME` | `meter-images` |
| `AZURE_COMMUNICATION_ENDPOINT` | ACS endpoint |
| `EMAIL_SENDER_ADDRESS` | OTP sender address |
| `ALLOWED_HOSTS` | `gasreading-backend.azurewebsites.net` |
| `DEBUG` | `False` |

---

## Viewing logs

**Live log stream (App Service):**
```bash
az webapp log tail --name gasreading-backend --resource-group gas-reading-app-rg
```

**Download logs:**
```bash
az webapp log download --name gasreading-backend --resource-group gas-reading-app-rg --log-file logs.zip
```

**Kudu log browser:**
`https://gasreading-backend.scm.azurewebsites.net/api/logs/docker`

---

## Known issues and gotchas

### PowerShell Compress-Archive uses backslash paths
`Compress-Archive` on Windows creates zip files with `\` path separators. When
extracted on Linux, files in subdirectories are **not** created correctly — old
versions of files persist in wwwroot and are not overwritten.

**Workaround:** Upload individual files directly via Kudu VFS API when a quick
hotfix is needed without a full redeploy:

```powershell
# Get publishing credentials
$creds = az webapp deployment list-publishing-credentials `
    --name gasreading-backend --resource-group gas-reading-app-rg `
    --query "[publishingUserName, publishingPassword]" -o tsv

$user = ($creds -split "`n")[0].Trim()
$pass = ($creds -split "`n")[1].Trim()
$base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${user}:${pass}"))

# Upload a file (replace ETag for updates, omit for new files)
$etag = (Invoke-WebRequest -Uri "https://gasreading-backend.scm.azurewebsites.net/api/vfs/site/wwwroot/config/settings.py" `
    -Headers @{Authorization="Basic $base64"} -Method Head).Headers.ETag

Invoke-WebRequest -Uri "https://gasreading-backend.scm.azurewebsites.net/api/vfs/site/wwwroot/config/settings.py" `
    -Method PUT `
    -Headers @{Authorization="Basic $base64"; "If-Match"=$etag; "Content-Type"="text/plain"} `
    -InFile "backend\config\settings.py"
```

### Vite base path must be `/static/`
`vite.config.js` must have `base: '/static/'`. Without this, the built `index.html`
references `/assets/...` but WhiteNoise only serves at `/static/assets/...`,
causing JS/CSS to be served with `text/html` MIME type and a blank page in Chrome.

### `az webapp deploy --type zip` does not trigger Oryx
Only `az webapp deployment source config-zip` (Kudu `/api/zipdeploy`) triggers
Oryx pip install. The `az webapp deploy` command completes in ~1 second without
installing packages, causing `No module named 'django'` errors.

### frontend_build/ is excluded from the zip
`frontend_build/` is intentionally excluded from the deployment zip — it is only
used locally by `collectstatic`. The compiled React files live in `staticfiles/`
which is included in the zip and deployed.

---

## How to update the app

### Update backend code only (no frontend changes)
```powershell
.\scripts\deploy.ps1 -SkipBuild
```

### Update frontend only (no backend logic changes)
```powershell
# Build and collect
cd frontend
npm run build
cd ..
# Copy build
Remove-Item backend\frontend_build -Recurse -Force
Copy-Item frontend\dist backend\frontend_build -Recurse
# Collect static
cd backend
.\venv\Scripts\python manage.py collectstatic --no-input
cd ..
# Deploy (SkipBuild since we already built)
.\scripts\deploy.ps1 -SkipBuild
```

### Hotfix a single file without full redeploy
Use the Kudu VFS API to upload one file directly (see **Known issues** section for the
PowerShell snippet). After uploading, restart the app:
```bash
az webapp restart --name gasreading-backend --resource-group gas-reading-app-rg
```

### Add a new Python package
1. Install locally: `pip install <package>` (with venv active)
2. Update `requirements.txt`: `pip freeze > requirements.txt`
3. Deploy: `.\scripts\deploy.ps1 -SkipBuild` — Oryx will install the new package

### Add a new Django app
1. `python manage.py startapp <appname>`
2. Add to `INSTALLED_APPS` in `settings.py`
3. Create `urls.py` and wire into `config/urls.py`
4. Deploy: `.\scripts\deploy.ps1 -SkipBuild`

### Run a database migration
Migrations are never run automatically. After adding/changing models:
1. `python manage.py makemigrations` locally
2. Commit the migration file
3. Deploy
4. Run via Kudu SSH console or GitHub Actions:
   ```bash
   python manage.py migrate
   ```

---

## Learnings from initial deployment

These are hard-won lessons from getting this app deployed — read before debugging.

### 1. `az webapp deploy --type zip` vs `az webapp deployment source config-zip`
- **`az webapp deploy --type zip`** — does NOT trigger Oryx. Completes in ~1 second.
  App crashes with `No module named 'django'` because pip packages were never installed.
- **`az webapp deployment source config-zip`** — triggers Oryx. Takes ~10 minutes.
  Oryx installs all packages from `requirements.txt` into a virtual environment.
- **Always use** `az webapp deployment source config-zip` for this project.

### 2. Oryx keeps staticfiles/ in wwwroot, but not frontend_build/
After a zip deploy, Oryx scans wwwroot and retains Python source files.
`frontend_build/` (raw Vite output) does NOT survive — Oryx excludes it.
`staticfiles/` (Django's collected static files) DOES survive.
This is why `collectstatic` must be run locally before deploying.

### 3. Vite base path must match Django's STATIC_URL
Vite defaults to `base: '/'` which outputs `<script src="/assets/index.js">`.
Django's static files are served at `/static/` by WhiteNoise.
Mismatch causes JS/CSS to be served with `text/html` MIME type → blank page.
Fix: set `base: '/static/'` in `vite.config.js`.

### 4. PowerShell Compress-Archive uses backslash paths in zip
On Windows, `Compress-Archive` creates zip entries like `config\urls.py`.
On Linux, these are treated as a single filename with a backslash, not as a path.
Result: existing files in wwwroot are NOT overwritten on redeploy.
This means code changes in subdirectories may silently not apply.
Fix for individual files: use Kudu VFS API to upload directly.
Long-term fix: migrate to `tar` on Linux or use a CI/CD pipeline.

### 5. gunicorn needs --chdir /home/site/wwwroot
Without `--chdir`, gunicorn cannot find `config.wsgi` as a Python module.
Always set the startup command to include `--chdir /home/site/wwwroot`.

### 6. PYTHONPATH must not be set to a Windows path
If `PYTHONPATH` is set in App Service config to a Windows path
(e.g. from a local dev session), the app will crash on startup.
Remove any `PYTHONPATH` app setting or set it to `/home/site/wwwroot`.

### 7. Django URL catch-all: use path() not re_path()
A `re_path(r'^(?!api/|admin/).*')` negative lookahead catch-all returns Django
404 mysteriously on Azure. Use explicit `path('', view)` + `path('<path:path>', view)` instead.

### 8. re_path() catch-all regex issue on Azure
The regex `^(?!api/|admin/).*` was matching but Django returned 404 without
calling the view. Root cause unknown but replacing with two explicit `path()`
patterns resolved it completely.

---

## Local development

**Backend:**
```bash
cd backend
# Activate venv
.\venv\Scripts\activate          # Windows
source venv/bin/activate          # Linux/Mac

# Set env vars (or use .env file)
python manage.py runserver
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev    # starts on http://localhost:5173
```

The frontend dev server proxies API calls to `http://localhost:8000` via
`VITE_API_URL=http://localhost:8000/api`.
