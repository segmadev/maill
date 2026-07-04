# Phase 1 Setup Guide

## 1. Azure App Registration (do this first)

1. Go to [portal.azure.com](https://portal.azure.com) → **Azure Active Directory** → **App registrations** → **New registration**
2. Name it (e.g. `mail-manager-dev`)
3. Under **Supported account types** choose **Accounts in any organizational directory and personal Microsoft accounts**
4. Set **Redirect URI** to `Web` → `http://localhost:8000/api/auth/microsoft/callback`
5. Click **Register**
6. Copy the **Application (client) ID** → this is `MICROSOFT_CLIENT_ID`
7. Copy the **Directory (tenant) ID** → use `common` unless you want org-only accounts
8. Go to **Certificates & secrets** → **New client secret** → copy the value → `MICROSOFT_CLIENT_SECRET`
9. Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions** → add:
   - `Mail.ReadWrite`
   - `Mail.Send`
   - `offline_access`
   - `User.Read`
   - `openid`, `profile`, `email` (usually pre-added)
10. Click **Grant admin consent** (if you're an admin) — or users will be individually prompted

---

## 2. Install dependencies

```bash
cd backend
composer install
```

---

## 3. Configure environment

```bash
cp .env.example .env
php artisan key:generate
```

Edit `.env` and fill in:

| Key | How to generate |
|-----|----------------|
| `JWT_SECRET` | `php -r "echo base64_encode(random_bytes(64));"` |
| `TOKEN_ENCRYPTION_KEY` | `php -r "echo bin2hex(random_bytes(16));"` |
| `MICROSOFT_CLIENT_ID` | From Azure portal (step 6 above) |
| `MICROSOFT_CLIENT_SECRET` | From Azure portal (step 8 above) |
| `DB_*` | Your local MySQL credentials |

---

## 4. Create the database

```sql
CREATE DATABASE email_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

---

## 5. Run migrations

```bash
php artisan migrate
```

This creates four tables: `users`, `connected_accounts`, `email_folders`, `emails`.

---

## 6. Start the server

```bash
php artisan serve
# Listening on http://localhost:8000
```

---

## 7. Test the auth flow

### Register
```bash
curl -s -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","password":"secret123","password_confirmation":"secret123"}' \
  | jq .
```

### Login
```bash
curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secret123"}' \
  | jq .
# Copy the "token" value
```

### Get Microsoft OAuth URL (paste your JWT)
```bash
curl -s http://localhost:8000/api/auth/microsoft/redirect \
  -H "Authorization: Bearer YOUR_JWT_HERE" \
  | jq .url
# Open the returned URL in a browser → sign in → redirected to /dashboard?account_added=true
```

### List connected accounts
```bash
curl -s http://localhost:8000/api/accounts \
  -H "Authorization: Bearer YOUR_JWT_HERE" \
  | jq .
```

---

## File map

```
backend/
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── AuthController.php            ← register, login, /me
│   │   │   ├── MicrosoftOAuthController.php  ← OAuth redirect + callback
│   │   │   └── AccountController.php         ← list + disconnect accounts
│   │   └── Middleware/
│   │       ├── JwtMiddleware.php             ← validates Bearer JWT
│   │       └── TokenRefreshMiddleware.php    ← proactive MS token refresh
│   ├── Models/
│   │   ├── User.php
│   │   └── ConnectedAccount.php
│   └── Services/
│       └── TokenEncryptionService.php        ← AES-256-CBC for stored tokens
├── bootstrap/app.php                         ← Laravel 11 app + middleware binding
├── config/
│   ├── app.php                               ← jwt_secret, token_encryption_key
│   ├── cors.php                              ← frontend origin allowlist
│   └── microsoft.php                         ← client_id, scopes, tenant
├── database/migrations/
│   ├── ..._create_users_table.php
│   ├── ..._create_connected_accounts_table.php
│   ├── ..._create_email_folders_table.php
│   └── ..._create_emails_table.php
└── routes/api.php
```
