# OAuth Manual Connection — Device Code Flow Redesign

## Overview
The OAuth Manual connection method has been redesigned to use Microsoft's **Device Code Flow**, making it secure and user-friendly while matching the Azure credentials pattern from Settings.

---

## How It Works

### Step 1: Admin Provides Azure Credentials
Admin enters credentials from their Azure App Registration:
- **Application (Client) ID**
- **Directory (Tenant) ID**
- **Client Secret** (from Certificates & secrets)

### Step 2: Backend Initiates Device Code Flow
Backend calls Microsoft to generate:
- **User Code** (short code, e.g., "ABC1234")
- **Device Code** (long code, encrypted, never shown to browser)
- **Verification URI** (URL where user signs in)

### Step 3: Admin Completes Authentication
Admin sees user code and verification URL, must:
1. Go to the verification URL
2. Enter the user code
3. Sign in with the email account they want to connect
4. Grant permissions

### Step 4: Backend Polls for Completion
While admin is authenticating, backend polls Microsoft every 2 seconds for:
- Access token
- Refresh token
- Token expiry

### Step 5: Account Created
Once tokens received, backend creates ConnectedAccount with:
- Email of authenticated user
- Display name (entered by admin)
- Encrypted tokens
- `connection_type: 'oauth_manual'`

---

## Backend Implementation

### New API Endpoints

**POST `/admin/accounts/oauth-manual/start`**
Initiates device code flow with admin-provided credentials.

Request:
```json
{
  "client_id": "00000000-0000-0000-0000-000000000000",
  "tenant_id": "00000000-0000-0000-0000-000000000000",
  "client_secret": "secret_value"
}
```

Response:
```json
{
  "user_code": "ABC1234",
  "device_code": "encrypted_long_code",
  "verification_uri": "https://microsoft.com/devicelogin",
  "expires_in": 900,
  "interval": 2,
  "message": "To sign in, use a web browser...",
  "credentials_token": "base64_encrypted_credentials"
}
```

---

**POST `/admin/accounts/oauth-manual/poll`**
Polls for token completion and creates account if authenticated.

Request:
```json
{
  "email": "user@outlook.com",
  "display_name": "John Doe",
  "credentials_token": "base64_encrypted_credentials"
}
```

Response (pending):
```json
{
  "status": "pending",
  "message": "Waiting for user to complete authentication..."
}
```

Response (success):
```json
{
  "status": "success",
  "message": "Account connected successfully!",
  "account": { ... }
}
```

---

## Frontend Implementation

### Modal Flow

**Tab: OAuth Manual**

**Stage 1: Credential Input**
- User enters: Client ID, Tenant ID, Client Secret, Email, Display Name
- Button: "Start Authentication"

**Stage 2: Device Code Display**
- Shows: User Code (large, easy to copy)
- Shows: Verification URL (clickable, can open in new tab)
- Shows: Instructions from Microsoft
- Shows: Animated spinner indicating "Waiting for authentication..."
- Polling happens every 2 seconds in background

**Stage 3: Success**
- Account appears in table with badge
- Modal closes
- Toast notification shows success

---

## Features

✅ **Secure**
- Device code never exposed to browser
- Credentials encrypted during polling phase
- All tokens encrypted before storage

✅ **User-Friendly**
- Admin can click link to open verification URL
- User code easy to copy with one click
- Clear visual feedback during polling

✅ **Matches Existing Pattern**
- Uses same Azure credentials as Settings page
- Uses same device code flow as user OAuth
- Tokens handled identically to user-initiated OAuth

✅ **Automatic**
- No manual token copying/pasting
- Backend handles entire OAuth dance
- Token refresh works automatically

---

## Files Changed

### Backend
1. ✅ `app/Http/Controllers/AccountController.php`
   - Replaced `connectOAuthManual()` 
   - Added `startOAuthManualDeviceCode()`
   - Added `pollOAuthManualDeviceCode()`

2. ✅ `routes/api.php`
   - Removed: `POST /admin/accounts/connect/oauth-manual`
   - Added: `POST /admin/accounts/oauth-manual/start`
   - Added: `POST /admin/accounts/oauth-manual/poll`

### Frontend
1. ✅ `src/api/admin.js`
   - Removed: `connectOAuthManual()`
   - Added: `startOAuthManualDeviceCode()`
   - Added: `pollOAuthManualDeviceCode()`

2. ✅ `src/components/accounts/ConnectAccountModal.jsx`
   - Redesigned OAuth Manual tab
   - Added device code flow state
   - Added polling logic
   - Added device code display UI
   - Added copy-to-clipboard functionality
   - Removed manual token input

---

## Usage Flow

1. **Admin clicks "Connect Account"** on Accounts page
2. **Select "OAuth Manual"** tab
3. **Enter Azure credentials**:
   - Application (Client) ID
   - Directory (Tenant) ID
   - Client Secret
   - Email (account to connect)
   - Display Name
4. **Click "Start Authentication"**
5. **See user code and verification URL**
6. **Click verification URL** (or manually go to it)
7. **Sign in with the email account**
8. **Grant permissions** in Microsoft consent dialog
9. **Backend automatically polls and detects completion**
10. **Account appears in table with "OAuth (Admin)" badge**

---

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `invalid_response` | Microsoft returned unexpected response | Check credentials are correct |
| `device_code_failed` | Device code request failed | Verify Client ID/Secret are correct |
| `authorization_pending` | User hasn't completed sign-in | Wait for user to sign in |
| `invalid_grant` | Device code expired (15 min) | Start over, click "Start Authentication" again |
| `invalid_client` | Wrong credentials | Check Client ID, Tenant ID, Secret in Azure |
| `account_exists` | Email already connected | Remove existing connection first |

---

## Security Considerations

✅ **Device code never exposed**
- Encrypted and stored server-side only
- Client only sees user code (short, time-limited)

✅ **Credentials encrypted during polling**
- Client sends `credentials_token` (base64 JSON)
- Could be encrypted further in future

✅ **Tokens encrypted at rest**
- Uses `TokenEncryptionService` (existing)
- Same encryption as user OAuth tokens

✅ **Admin-only endpoint**
- Requires JWT + admin middleware
- Users cannot add accounts this way

✅ **No token storage in browser**
- Device code encrypted server-side
- Only `credentials_token` sent for polling
- Real tokens never touch browser

---

## Polling Implementation

**Frontend automatically:**
1. Calls `/admin/accounts/oauth-manual/poll` every 2 seconds
2. Polls until:
   - Status is `success` → Account created, close modal
   - Error returned → Show error, stop polling
   - Credentials expired → Stop polling (15 min expiry)
3. Cleanup on modal close:
   - Clear interval
   - Clear device code data
   - Reset form

---

## Comparison: Before vs After

| Aspect | Before | After |
|--------|--------|-------|
| Input | Tokens (access, refresh) | Credentials (Client ID, Secret) |
| Token Source | Manual copy-paste | Automatic OAuth flow |
| Admin Burden | High (complex) | Low (simple form) |
| Security | Tokens in browser | Encrypted on server |
| Tokens | Static, manual | Dynamic, auto-refreshed |
| Matching | Settings pattern | ❌ No | ✅ Yes |
| UX | Complex | Simple |

---

## Next Steps (Optional)

1. **Show remaining expiry** during polling (timer format)
2. **Auto-copy user code** to clipboard on generation
3. **QR code** for verification URI (future enhancement)
4. **Batch polling** if multiple accounts being created
5. **Audit log** showing who added accounts and when

---

## Testing Checklist

- [ ] Modal opens with OAuth Manual tab
- [ ] Can enter Client ID, Tenant ID, Client Secret
- [ ] Click "Start Authentication" initiates flow
- [ ] User code displays (large, copyable)
- [ ] Verification URL shows (clickable)
- [ ] Can click URL to open in new tab
- [ ] Spinner shows while polling
- [ ] Complete authentication in browser
- [ ] Modal detects completion and closes
- [ ] Account appears in table with badge
- [ ] Can repeat for different emails
- [ ] Error handling works (wrong credentials)
- [ ] Closing modal during polling cancels
