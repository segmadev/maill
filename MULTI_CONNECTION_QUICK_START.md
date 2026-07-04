# Multi-Connection Feature — Quick Start Guide

## ✅ Implementation Complete

All backend and frontend code has been implemented and integrated. The database migration has been run successfully.

---

## 📋 What's New

### Three Connection Methods
1. **OAuth (User Sign-In)** — Existing method, unchanged
2. **OAuth (Admin Manual)** — New: Admin provides Microsoft Client ID/Secret
3. **SMTP/IMAP** — New: Admin provides email server credentials

### Visual Indicators
- **Connection Type Badges** displayed in Accounts table
  - Blue: OAuth
  - Purple: OAuth (Admin)
  - Green: SMTP/IMAP

### Admin Controls
- **"Connect Account" button** on Accounts page
- **Test SMTP** before saving
- **Priority field** for fallback support (ready for future use)

---

## 🎯 How to Use

### Access the Feature

1. **Log in to Admin Dashboard**
   - URL: `http://localhost:7100`
   - Go to "Connected Accounts" page

2. **Click "Connect Account" button** (top right)
   - Opens modal with three tabs

### Method 1: OAuth Manual (Admin)

1. Select **"OAuth Manual"** tab
2. Fill in:
   - **Email**: user@outlook.com
   - **Display Name**: John Doe
   - **Access Token**: (from Microsoft Graph)
   - **Refresh Token**: (from Microsoft Graph)
   - **Expires In**: 3600 (or actual expiry seconds)
   - **Client ID**: Microsoft App Registration ID
3. Click **"Connect OAuth Account"**
4. Account appears with **"OAuth (Admin)"** badge

### Method 2: SMTP/IMAP (Admin)

1. Select **"SMTP/IMAP"** tab
2. Fill in SMTP details:
   - **Email**: user@gmail.com
   - **Display Name**: Jane Doe
   - **SMTP Host**: smtp.gmail.com
   - **SMTP Port**: 587 (or 465 for SSL)
   - **Username/Email**: user@gmail.com
   - **Password**: app-password or actual password
   - **Use TLS**: ✓ (usually checked)
   - **Use SSL**: (usually unchecked)
3. Click **"Test Connection"**
   - Tests SMTP authentication
   - Shows success/error message
4. After test succeeds, click **"Connect SMTP Account"**
5. Account appears with **"SMTP/IMAP"** badge

### Viewing Connected Accounts

- **Accounts page** shows all accounts in table
- **New "Type" column** displays connection method with badge
- Color-coded for quick visual identification
- Other actions (Inbox, Extract, Renew, Revoke) work as before

---

## 🔧 SMTP Test Examples

### Gmail
```
Host: smtp.gmail.com
Port: 587 (TLS) or 465 (SSL)
Username: your-email@gmail.com
Password: App Password (not regular password)
Use TLS: ✓
```

### Outlook.com
```
Host: smtp-mail.outlook.com
Port: 587
Username: your-email@outlook.com
Password: Your Outlook password
Use TLS: ✓
```

### Custom Email Server
```
Host: mail.yourdomain.com
Port: 25, 465, or 587 (check your provider)
Username: full-email@yourdomain.com
Password: Your email password
Use TLS or SSL: Check with provider
```

---

## 📊 What Changed in the Database

Run the migration (already done):
```bash
php artisan migrate
```

New columns in `connected_accounts` table:
- `connection_type` (string) — 'oauth', 'oauth_manual', or 'smtp'
- `smtp_credentials` (text) — Encrypted JSON with SMTP config
- `priority` (integer) — Fallback order (NULL = auto)
- `oauth_client_id` (string) — For admin reference

---

## 🔐 Security Notes

✅ **All credentials are encrypted**
- SMTP passwords encrypted with `TokenEncryptionService`
- Not exposed in API responses
- Can only be read from database, not via API

✅ **Admin-only endpoints**
- All new endpoints require JWT + admin middleware
- Non-admins cannot add/test/modify accounts

✅ **Validation**
- Email uniqueness enforced
- SMTP test before save prevents invalid credentials
- Proper HTTP status codes and error messages

---

## 🚀 API Endpoints (for reference)

### Admin Only (POST/PATCH)

```
POST   /admin/accounts/connect/oauth-manual    — Add OAuth connection
POST   /admin/accounts/connect/smtp            — Add SMTP connection  
POST   /admin/accounts/test-smtp               — Test SMTP credentials
PATCH  /admin/accounts/{id}/priority           — Set fallback priority
```

### Existing Endpoints (unchanged)
```
GET    /admin/accounts                         — List accounts (with new type field)
DELETE /admin/accounts/{id}                    — Remove account
POST   /admin/accounts/{id}/refresh            — Refresh OAuth token
```

---

## 🧪 Testing Checklist

- [ ] Can open Accounts page and see "Connect Account" button
- [ ] Modal opens with three tabs
- [ ] Can fill and submit OAuth manual form
- [ ] Can fill SMTP form and click "Test Connection"
- [ ] Test connection shows success/error message
- [ ] Can submit SMTP form after test succeeds
- [ ] New accounts show in table with correct badge color
- [ ] "Type" column displays correctly
- [ ] Other account actions (Inbox, Extract, Revoke) still work
- [ ] Duplicate email prevention works
- [ ] Can filter/search accounts as before

---

## 📁 Files Changed

### Backend (5 files)
1. ✅ `database/migrations/2026_06_26_000001_add_connection_type_to_connected_accounts.php`
2. ✅ `app/Services/SmtpService.php`
3. ✅ `app/Http/Controllers/AccountController.php`
4. ✅ `app/Models/ConnectedAccount.php`
5. ✅ `routes/api.php`

### Frontend (4 files)
1. ✅ `src/components/accounts/ConnectAccountModal.jsx`
2. ✅ `src/components/accounts/ConnectionBadge.jsx`
3. ✅ `src/pages/AccountsPage.jsx`
4. ✅ `src/api/admin.js`

### Documentation
1. ✅ `MULTI_CONNECTION_FEATURE.md` — Full implementation details
2. ✅ `MULTI_CONNECTION_QUICK_START.md` — This file

---

## 🔮 Future Enhancements

The foundation is ready for:
- **Fallback Logic**: Automatic switch to secondary connection if primary fails
- **Email Sending via SMTP**: Implement SMTP-based sending alongside Graph API
- **IMAP Sync**: Pull emails from SMTP-connected accounts
- **Edit Credentials**: Update SMTP password for existing connections
- **Connection Stats**: Show last used, email count, sync status
- **Audit Logging**: Track who connected accounts and when

---

## 📞 Troubleshooting

**"Only admins can add connections"**
- Logged-in user is not an admin
- Use an admin account

**"SMTP test failed"**
- Host/port incorrect — check your email provider
- Username/password wrong — verify credentials
- Port blocked — some providers use specific ports (465 for SSL, 587 for TLS)
- App password required — Gmail requires app-specific password, not account password

**"An account with this email already exists"**
- Email is already connected (OAuth, OAuth Manual, or SMTP)
- Each unique email can only be connected once
- Delete existing connection first

**Token not refreshing for OAuth accounts**
- Existing functionality — refresh_token may have expired
- User needs to reconnect via OAuth sign-in
- Admin can also disconnect and re-add manually

---

## 💡 Tips

- Test SMTP connection before saving to catch errors early
- Use email provider's app-specific passwords when required
- Different emails = different accounts (same person can have multiple accounts)
- Connection badges make it easy to see at a glance what type of connection each account uses
- Priority field is ready for future fallback implementation

---

**Ready to test? Go to the Accounts page and try adding a connection!** 🎉
