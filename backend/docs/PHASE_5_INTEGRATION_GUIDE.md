# Phase 5: BFF for Connected Accounts - Integration Guide

## How to Use the New Services

### 1. Auto-Refresh Tokens on Graph API Calls

**For Email Sending:**

```php
// In any controller that sends emails using a connected account
use App\Services\ConnectedAccountTokenService;

class SendEmailController extends Controller
{
    public function send(Request $request, ConnectedAccountTokenService $tokenService)
    {
        $account = ConnectedAccount::find($request->input('account_id'));

        // Check if re-auth is needed
        if ($tokenService->requiresReauth($account)) {
            return response()->json([
                'error' => 'requires_reauth',
                'message' => 'Please re-authenticate this account',
            ], 401);
        }

        // Get fresh token (auto-refreshes if needed)
        $token = $tokenService->ensureAccessTokenValid($account);
        if (!$token) {
            return response()->json([
                'error' => 'token_refresh_failed',
                'message' => 'Failed to refresh token',
            ], 401);
        }

        // Use token for Graph API call
        $authHeader = $tokenService->getAuthorizationHeader($account);
        
        // Make API call with $authHeader
        // ...
    }
}
```

**Using Middleware (Simpler):**

```php
// In routes/api.php
Route::post('/accounts/{account_id}/send-email', [SendEmailController::class, 'send'])
    ->middleware('connected.account.token.refresh');

// In controller, token is already on request
public function send(Request $request)
{
    $account = $request->attributes->get('connected_account');
    $token = $request->attributes->get('microsoft_token');
    
    // Use $token directly
}
```

### 2. Handle Re-Auth Errors

**Frontend:**

```javascript
// In API client error handling
if (error.response?.status === 401 && error.response?.data?.error === 'requires_reauth') {
    // Show re-auth prompt
    showModal('Account Expired', `${error.response.data.email} needs re-authentication`);
    // Navigate to /accounts/{id}/reauthenticate
}
```

### 3. Store SMTP Credentials

**When user adds SMTP account:**

```php
use App\Services\SMTPCredentialService;

public function addSMTPAccount(Request $request, SMTPCredentialService $smtpService)
{
    $account = ConnectedAccount::find($request->input('account_id'));
    
    $credentials = [
        'host' => $request->input('smtp_host'),
        'port' => $request->input('smtp_port'),
        'username' => $request->input('smtp_username'),
        'password' => $request->input('smtp_password'),
        'encryption' => $request->input('smtp_encryption', 'TLS'),
        'from_address' => $account->email,
        'from_name' => $account->display_name,
    ];
    
    // Validate connection
    if (!$smtpService->validateConnection($credentials)) {
        return response()->json(['error' => 'Invalid SMTP credentials'], 400);
    }
    
    // Store encrypted
    $smtpService->storeCredentials($account, $credentials);
    
    return response()->json(['message' => 'SMTP credentials saved']);
}
```

**When sending via SMTP:**

```php
use App\Services\SMTPCredentialService;

public function sendViaSMTP(ConnectedAccount $account, SMTPCredentialService $smtpService)
{
    $credentials = $smtpService->getCredentials($account);
    if (!$credentials) {
        return response()->json(['error' => 'No SMTP credentials'], 400);
    }
    
    // Use credentials to send via SwiftMailer, PHPMailer, or similar
    $transport = new \Swift_SmtpTransport(
        $credentials['host'],
        $credentials['port'],
        $credentials['encryption']
    );
    // ...
}
```

### 4. Handle Token Refresh Failures

```php
use App\Services\ConnectedAccountTokenService;

public function getEmails(Request $request, ConnectedAccountTokenService $tokenService)
{
    $account = ConnectedAccount::find($request->input('account_id'));
    
    // This automatically handles refresh
    $token = $tokenService->ensureAccessTokenValid($account);
    
    if (!$token) {
        // Token refresh failed - mark for re-auth
        $tokenService->markRequiresReauth(
            $account,
            'Failed to refresh OAuth token after 3 attempts'
        );
        
        return response()->json([
            'error' => 'requires_reauth',
            'email' => $account->email,
        ], 401);
    }
    
    // Continue with Graph API call...
}
```

## Route Examples

### Using Middleware Approach (Recommended)

```php
// routes/api.php

// All email operations auto-refresh tokens
Route::middleware(['api.auth', 'connected.account.token.refresh'])->prefix('accounts/{account_id}')->group(function () {
    Route::post('/send-email', [MailController::class, 'send']);
    Route::get('/emails', [MailController::class, 'getEmails']);
    Route::post('/sync-emails', [MailController::class, 'sync']);
    Route::get('/folders', [FolderController::class, 'list']);
    Route::post('/folders/{folder_id}/sync', [FolderController::class, 'sync']);
});

// Re-authentication endpoint
Route::post('/accounts/{account_id}/reauthenticate', [AccountController::class, 'initiateReauth']);
Route::get('/accounts/oauth/callback', [AccountController::class, 'handleReAuthCallback']);
```

## Migration Path from Old to New

### Old Way (Frontend handles tokens)
```
User connects account → Tokens sent to frontend → Frontend makes Graph API calls
Problem: Tokens expire after 24 hours → Crashes
```

### New Way (Backend handles tokens)
```
User connects account → Tokens stored encrypted in DB → Backend makes Graph API calls
Benefit: Tokens auto-refresh → No 24-hour crashes
```

### Gradual Migration

1. **Step 1**: Deploy ConnectedAccountTokenService (no changes to existing code)
2. **Step 2**: Update email sending to use tokenService.getAuthorizationHeader()
3. **Step 3**: Update email receiving to use tokenService.getAuthorizationHeader()
4. **Step 4**: Add middleware to auto-refresh
5. **Step 5**: Update account connection flow for new accounts

Old accounts continue working. New accounts use BFF immediately.

## Testing the BFF Flow

### Test Case 1: Normal Operation

```bash
1. Connect Outlook account via OAuth
2. Check connected_accounts table - tokens should be encrypted
3. Send email immediately
   → Should work with auto-refreshed token
4. Wait a few minutes
5. Send another email
   → Should work (token auto-refreshed if needed)
```

### Test Case 2: Token Refresh (Simulated 24hr)

```bash
1. Connect account
2. Set token_expires_at = now() in database
3. Make API call
   → Middleware should detect expired token
   → Call ConnectedAccountTokenService.refreshAccessToken()
   → Should get new token from Microsoft
   → Continue request with new token
4. Verify new tokens in database
```

### Test Case 3: Refresh Token Expiration (After 24h)

```bash
1. Connect account
2. Set refresh_token_expires_at = past date in database
3. Make API call
   → Middleware tries to refresh
   → Microsoft returns "invalid_grant"
   → ConnectedAccountTokenService sets requires_reauth = true
   → Middleware returns 401 with "requires_reauth" error
4. Verify requires_reauth flag in database
5. Frontend shows "Re-authenticate this account" prompt
6. User clicks re-auth → Starts fresh OAuth flow
7. After re-auth, requires_reauth = false, new tokens obtained
8. Email operations resume
```

### Test Case 4: SMTP Credentials

```bash
1. Add SMTP credentials for account
2. Verify encrypted in database (smtp_credentials column)
3. Send email via SMTP
   → Should retrieve credentials
   → Should decrypt correctly
   → Should connect to SMTP server
   → Should send email
4. Verify no errors in logs
```

## Performance Considerations

### Token Refresh Performance
- Average refresh: ~200-500ms
- Cached in process (no second call if within 5 minutes)
- Runs in middleware (before controller)
- Non-blocking (doesn't wait for next refresh)

### Credential Decryption Performance
- Single AES-256-CBC decrypt per request
- ~1-5ms per decryption
- Cached in service instance
- Minimal overhead

### Recommended Caching
```php
// Cache SMTP credentials for 1 hour
$credentials = Cache::remember(
    "smtp_creds_{$accountId}",
    3600,
    fn() => $smtpService->getCredentials($account)
);
```

## Security Guarantees

✅ **Tokens never exposed to frontend** - Stored encrypted in DB, only backend accesses  
✅ **Passwords never exposed to frontend** - SMTP credentials encrypted, backend-only  
✅ **Encryption at rest** - AES-256-CBC encryption  
✅ **Automatic refresh** - Tokens refreshed before expiry  
✅ **Graceful re-auth** - Expired tokens don't crash, prompt re-auth  
✅ **Audit trail** - All token operations logged

## Troubleshooting

### Accounts keep requiring re-auth
- Check `refresh_token_expires_at` - should be far in future
- Check `requires_reauth` flag - should be false after re-auth
- Check logs for refresh errors
- Verify Microsoft OAuth credentials in config

### SMTP emails not sending
- Verify `smtp_credentials` column is populated
- Check for decryption errors in logs
- Validate credentials with `$smtpService->validateConnection()`
- Verify SMTP host/port/username/password

### Token refresh failing
- Check Microsoft API status
- Verify `encrypted_oauth_secret` is set
- Check `refresh_failed_count` and `last_refresh_error`
- Verify network connectivity

## Next Steps

1. Update AccountController for new account connections
2. Add middleware to existing email routes
3. Update frontend to handle re-auth prompts
4. Test end-to-end
5. Deploy to production
6. Monitor token refresh logs
7. Gradually migrate existing accounts (optional)
