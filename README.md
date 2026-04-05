# Gas Reading App

A web application for residents to submit monthly gas meter photos and for admins to review and record the readings.

## What it does

- Residents log in via email OTP, upload a photo of their gas meter, and track their submission status
- Admins review submissions, enter the reading value, and mark them as reviewed
- Meter photos are stored in Azure Blob Storage
- OTP emails are sent via Azure Communication Services

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Django 6 + Django REST Framework |
| Auth | JWT (SimpleJWT) + email OTP |
| Database | Azure PostgreSQL Flexible Server |
| File storage | Azure Blob Storage |
| Email | Azure Communication Services |
| Secrets | Azure Key Vault (Managed Identity) |
| Hosting | Azure App Service (Linux) |
| CI/CD | GitHub Actions |

## Project structure

```
GasReadingApp/
├── frontend/               React app (Vite)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx     OTP login
│   │   │   ├── SetupPage.jsx     Profile setup (block/flat)
│   │   │   ├── UploadPage.jsx    Resident submission page
│   │   │   ├── AdminPage.jsx     Admin review dashboard
│   │   │   └── ProtectedRoute.jsx
│   │   ├── context/              Auth context
│   │   └── services/             API client
│   └── public/
│       └── favicon.svg
├── backend/                Django app
│   ├── config/             Settings, URLs, WSGI
│   ├── authentication/     OTP auth, JWT, user model
│   ├── submissions/        Submission model, views, serializers
│   └── requirements.txt
├── .github/
│   └── workflows/
│       └── deploy-backend.yml   CI/CD pipeline
├── scripts/
│   └── deploy.ps1          Manual deploy script (PowerShell)
└── DEPLOYMENT.md           Detailed deployment guide
```

## Local development

### Prerequisites
- Python 3.12
- Node.js 20
- Azure CLI (`az login` for OTP emails and Blob uploads)
- Access to the Azure PostgreSQL firewall (your IP must be allowlisted)

### Backend

```bash
cd backend
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

pip install -r requirements.txt
```

Create a `.env` file in `backend/`:

```env
SECRET_KEY=your-local-secret-key
DEBUG=True
DATABASE_URL=postgres://username:password@gasreading-db-v2.postgres.database.azure.com:5432/postgres?sslmode=require
AZURE_KEYVAULT_URL=https://gasreading-kv.vault.azure.net/
AZURE_STORAGE_ACCOUNT_NAME=gasreadingdk2024
AZURE_BLOB_CONTAINER_NAME=meter-images
AZURE_COMMUNICATION_ENDPOINT=https://gasreading-acs.unitedstates.communication.azure.com
EMAIL_SENDER_ADDRESS=DoNotReply@<your-acs-domain>
ALLOWED_HOSTS=localhost,127.0.0.1
```

```bash
python manage.py migrate
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev    # http://localhost:5173
```

The frontend expects the backend at `http://localhost:8000/api` by default.

## Deployment

Pushes to `master` automatically deploy via GitHub Actions (see `.github/workflows/deploy-backend.yml`).

The pipeline:
1. Builds the React frontend (`npm run build`)
2. Copies the build into `backend/frontend_build/`
3. Runs `collectstatic` (bundles React + Django admin assets)
4. Zips the backend and deploys to Azure App Service via Kudu
5. Uploads `staticfiles/` directly via Kudu VFS (ensures WhiteNoise has all files)
6. Restarts the app
7. Hits `/health/` to confirm the deploy succeeded

For manual deployment or more detail, see [DEPLOYMENT.md](DEPLOYMENT.md).

## API endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/api/auth/request-otp/` | Public | Send OTP to email |
| POST | `/api/auth/verify-otp/` | Public | Verify OTP, get JWT |
| GET/PATCH | `/api/auth/profile/` | Resident | Get/update block & flat |
| POST | `/api/submissions/` | Resident | Upload meter photo |
| GET | `/api/submissions/` | Resident | List own submissions |
| GET | `/api/submissions/admin/` | Admin | List all submissions |
| PATCH | `/api/submissions/admin/<id>/` | Admin | Review a submission |
| GET | `/health/` | Public | Health check (DB connectivity) |

## Azure resources

| Resource | Name |
|---|---|
| App Service | `gasreading-backend` |
| Resource Group | `gas-reading-app-rg` |
| PostgreSQL | `gasreading-db-v2` |
| Key Vault | `gasreading-kv` |
| Blob Storage | `gasreadingdk2024` / `meter-images` |
| Communication Services | `gasreading-acs` |

## What I learned building this

### Azure App Service + Django
- Django and React can be served from a single App Service — WhiteNoise serves static files and the SPA catch-all handles client-side routing
- `WHITENOISE_ROOT = STATIC_ROOT` is needed to serve `index.html` at `/` (not just `/static/index.html`)
- `gunicorn` needs `--chdir /home/site/wwwroot` otherwise it cannot find `config.wsgi` as a Python module
- Never set `PYTHONPATH` to a Windows path in App Service settings — it will crash on Linux

### Static files and Vite
- Vite's default `base: '/'` outputs `<script src="/assets/index.js">` — Django serves static files at `/static/`, so the mismatch causes JS/CSS to return `text/html` MIME type and a blank page
- The fix is `base: '/static/'` in `vite.config.js` — always match Vite's base to Django's `STATIC_URL`
- WhiteNoise indexes static files once at startup — files uploaded after the app starts are not served until restart

### Deployment gotchas
- `az webapp deploy --type zip` does NOT trigger Oryx (pip install). Always use `az webapp deployment source config-zip` (Kudu zipdeploy)
- `Compress-Archive` on Windows creates zip entries with backslash paths (`config\urls.py`) — Linux treats these as a single filename, so files in subdirectories are silently not updated on redeploy. Fix: use Linux `zip` in CI/CD
- Uploading staticfiles via Kudu VFS before restarting ensures WhiteNoise has all files indexed at startup

### Azure identity and secrets
- `DefaultAzureCredential` probes 7+ credential providers sequentially — each times out locally, adding 10+ seconds. Use `AzureCliCredential` explicitly for local dev and `ManagedIdentityCredential` on App Service
- Azure Key Vault with Managed Identity means zero secrets in App Service config or environment — the app fetches them at startup
- Git Bash on Windows converts `/subscriptions/...` paths to Windows paths when passed to Azure CLI. Fix: set `MSYS_NO_PATHCONV=1`

### CI/CD with GitHub Actions
- A single pipeline can build frontend (Node) and backend (Python), bundle them, and deploy — keeping everything in sync on every push
- GitHub Actions secrets (`AZURE_CREDENTIALS`) store the service principal JSON for `az login`
- A health check step at the end of the pipeline catches deploy failures before they reach users

### Security
- OTP codes should use `secrets.choice` (cryptographically secure RNG), not `random.choices`
- JWT tokens for stateless auth — no server-side session storage needed
- All database credentials and API keys in Key Vault, accessed via Managed Identity — no hardcoded secrets anywhere

## User roles

**Resident** — any authenticated user with a complete profile (block + flat set)
- Can submit one meter photo per period
- Can view their own submission history and status

**Admin** — users with `is_staff=True` in Django
- Can view all submissions with filtering and sorting
- Can enter reading values and mark submissions as reviewed
- Access Django admin at `/admin/`
