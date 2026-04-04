# Key Vault Migration Guide

Move the PostgreSQL password out of App Service environment variables into Azure Key Vault.
After this, **no secrets exist anywhere outside of Key Vault** — not in code, git, or App Service config.

---

## What this changes

| Before | After |
|---|---|
| `DATABASE_URL` stored as plain text in App Service env vars | Password stored encrypted in Key Vault |
| Anyone with Azure portal access can read it | Only the App Service managed identity can read it |
| No audit trail | Every read is logged |

---

## Step 1 — Create the Key Vault

```bash
az keyvault create \
  --name gasreading-kv \
  --resource-group gas-reading-app-rg \
  --location eastus \
  --enable-rbac-authorization true
```

---

## Step 2 — Store the DB password as a secret

```bash
az keyvault secret set \
  --vault-name gasreading-kv \
  --name "DB-PASSWORD" \
  --value "GasApp@2024Secure"
```

> Store any other secrets you want to protect the same way:
> ```bash
> az keyvault secret set --vault-name gasreading-kv --name "DJANGO-SECRET-KEY" --value "your-secret-key"
> ```

---

## Step 3 — Enable Managed Identity on App Service

```bash
az webapp identity assign \
  --name gasreading-backend \
  --resource-group gas-reading-app-rg
```

Note the `principalId` printed in the output — you need it in Step 4.

---

## Step 4 — Grant App Service read access to Key Vault

```bash
# Get the Key Vault resource ID
KEYVAULT_ID=$(az keyvault show --name gasreading-kv --query id -o tsv)

# Grant "Key Vault Secrets User" role to the App Service identity
az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee "<principalId from Step 3>" \
  --scope "$KEYVAULT_ID"
```

---

## Step 5 — Update Django settings to read from Key Vault

Install the SDK (already in requirements.txt if azure-identity is present):
```bash
pip install azure-keyvault-secrets azure-identity
```

Add to `backend/config/settings.py`:

```python
import os
from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential

def get_secret(name: str, fallback: str = '') -> str:
    """Fetch a secret from Key Vault if running on Azure, else use env var."""
    vault_url = os.environ.get('AZURE_KEYVAULT_URL')
    if vault_url:
        try:
            client = SecretClient(vault_url=vault_url, credential=DefaultAzureCredential())
            return client.get_secret(name).value
        except Exception:
            pass
    return config(name.replace('-', '_'), default=fallback)

# Replace the DATABASE_URL line with:
DB_PASSWORD = get_secret('DB-PASSWORD')
DATABASE_URL = f"postgresql://gasadmin:{DB_PASSWORD}@gasreading-db-v2.postgres.database.azure.com/gasreading?sslmode=require"
DATABASES = {'default': dj_database_url.parse(DATABASE_URL)}
```

---

## Step 6 — Add Key Vault URL to App Service config (not a secret)

```bash
az webapp config appsettings set \
  --name gasreading-backend \
  --resource-group gas-reading-app-rg \
  --settings AZURE_KEYVAULT_URL="https://gasreading-kv.vault.azure.net/"
```

Then **remove** `DATABASE_URL` from App Service settings:
```bash
az webapp config appsettings delete \
  --name gasreading-backend \
  --resource-group gas-reading-app-rg \
  --setting-names DATABASE_URL
```

---

## Step 7 — Local development

Locally, `get_secret()` falls back to the `.env` file since `AZURE_KEYVAULT_URL` is not set.
No change needed for local dev — keep `DATABASE_URL` in `.env` as usual.

Alternatively, set `AZURE_KEYVAULT_URL` in your local `.env` and it will use Key Vault
directly (requires `az login` to be active).

---

## Final state — zero secrets in configuration

| What | Where |
|---|---|
| DB password | Key Vault (encrypted, audited) |
| Blob Storage access | Managed Identity (no secret at all) |
| ACS Email access | Managed Identity (no secret at all) |
| App Insights connection string | App Service env var (not a secret — it's just a URL) |
| Django SECRET_KEY | Key Vault (optional but recommended) |
