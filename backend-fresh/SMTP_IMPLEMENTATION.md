# SMTP Implementation with PHPMailer

## Overview

The `SmtpService` now supports both password-based SMTP and OAuth2-based SMTP using PHPMailer v7.1.1.

## Features

✅ **Password-based SMTP** - Traditional SMTP with username/password  
✅ **OAuth2-based SMTP** - Send via OAuth tokens (no password needed)  
✅ **STARTTLS & SSL** - Full encryption support  
✅ **Error Handling** - Detailed error logging  
✅ **Connection Testing** - Validate credentials before saving  

---

## Method 1: Password-Based SMTP

For accounts with SMTP credentials (username/password).

### Configuration

```php
$credentials = [
    'host'     => 'smtp.office365.com',
    'port'     => 587,
    'username' => 'user@outlook.com',
    'password' => 'your-password-or-app-password',
    'use_tls'  => true,
    'use_ssl'  => false,
];
```

### Usage

```php
$smtpService = new \App\Services\SmtpService();

// Test connection
try {
    $smtpService->testConnection($credentials);
    echo "✓ Connection successful!";
} catch (RuntimeException $e) {
    echo "✗ Connection failed: " . $e->getMessage();
}

// Send email
$to = ['recipient@example.com' => 'Recipient Name'];
$cc = ['cc@example.com' => 'CC Name'];
$bcc = [];

try {
    $smtpService->send(
        $credentials,
        'sender@outlook.com',
        'Sender Name',
        $to,
        $cc,
        $bcc,
        'Subject',
        '<p>Email body in HTML</p>',
        true, // isHtml
        17    // accountId
    );
    echo "✓ Email sent!";
} catch (RuntimeException $e) {
    echo "✗ Send failed: " . $e->getMessage();
}
```

---

## Method 2: OAuth2-Based SMTP (XOAUTH2)

For OAuth-connected accounts using SMTP with proper OAuth2 authentication.

### How It Works

Uses PHPMailer's `setOAuth()` method with Azure provider:
- **No password stored** - Uses OAuth tokens instead
- **Automatic token refresh** - PHPMailer handles refresh token flow
- **XOAUTH2 authentication** - Proper OAuth2 protocol
- **More secure** - Credentials never leave the system

### Configuration

```php
// Get OAuth credentials from account
$clientId = $account->oauth_client_id;
$clientSecret = decrypt($account->oauth_client_secret);
$refreshToken = decrypt($account->refresh_token);
$from = $account->email; // 'user@outlook.com'
$fromName = $account->display_name;
```

### Usage - Single Email

```php
$smtpService = new \App\Services\SmtpService();

$to = ['recipient@example.com' => 'Recipient Name'];
$cc = [];
$bcc = [];

try {
    $smtpService->sendViaOAuth(
        $from,              // 'user@outlook.com'
        $fromName,          // 'Display Name'
        $to,
        $cc,
        $bcc,
        'Subject',
        '<p>Email body in HTML</p>',
        $clientId,          // OAuth client ID
        $clientSecret,      // OAuth client secret (decrypted)
        $refreshToken,      // OAuth refresh token (decrypted)
        true,               // isHtml
        $accountId          // for logging
    );
    echo "✓ Email sent via OAuth2 SMTP!";
} catch (RuntimeException $e) {
    echo "✗ Send failed: " . $e->getMessage();
}
```

### PHPMailer OAuth Flow (Under the Hood)

```php
$mail->isSMTP();
$mail->Host = 'smtp.office365.com';
$mail->Port = 587;
$mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
$mail->AuthType = 'XOAUTH2';

// Create OAuth provider
$provider = new OAuth();
$provider->setProvider('Azure');
$provider->setClientId($clientId);
$provider->setClientSecret($clientSecret);
$provider->setRefreshToken($refreshToken);
$provider->setUsername($from);

// Attach OAuth provider
$mail->setOAuth($provider);

// PHPMailer now handles token refresh automatically!
```

---

## Configuration Details

### SMTP Settings for Outlook/Microsoft 365

**Port 587 (Recommended - STARTTLS)**
```php
[
    'host'     => 'smtp.office365.com',
    'port'     => 587,
    'use_tls'  => true,
    'use_ssl'  => false,
]
```

**Port 465 (Implicit SSL)**
```php
[
    'host'     => 'smtp.office365.com',
    'port'     => 465,
    'use_tls'  => false,
    'use_ssl'  => true,
]
```

### Authentication

**Regular Password**
```php
'password' => 'your-actual-password'
```

**With 2FA - Use App Password**
```php
'password' => 'your-app-password-16-chars'
```

---

## Error Handling

All methods throw `RuntimeException` on failure with descriptive messages:

```php
try {
    $smtpService->send(...);
} catch (RuntimeException $e) {
    $error = $e->getMessage();
    
    // Log errors
    Log::error("SMTP Error: $error");
    
    // Return to user
    return response()->json([
        'error' => 'smtp_error',
        'message' => $error,
    ], 422);
}
```

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `SMTP_MISSING_CREDENTIALS` | Empty host/username/password | Fill in all required fields |
| `SMTP_TEST_FAILED: Connection failed` | Wrong host/port | Verify SMTP host and port |
| `SMTP_SEND_FAILED: Authentication failed` | Wrong password | Use correct password or app password |
| `SMTP_OAUTH_SEND_FAILED: OAuth error` | Token expired/invalid | Refresh OAuth token |

---

## Logging

All operations are logged to `storage/logs/laravel.log`:

```
SMTP_SEND_START: Starting email send
SMTP_SEND_SUCCESS: Email sent successfully
SMTP_SEND_FAILED: Detailed error message
SMTP_OAUTH_SEND_START: Starting OAuth-based send
PHPMAILER_DEBUG: Detailed PHPMailer debug info
```

Check logs with:
```bash
tail -f storage/logs/laravel.log | grep SMTP
```

---

## Integration with EmailController

In `EmailController.php`, the `send()` method now uses PHPMailer:

```php
if ($account->connection_type === 'smtp') {
    // Password-based SMTP
    $smtpService->send(
        $credentials,
        $account->email,
        $account->display_name,
        $to,
        $cc,
        $bcc,
        $data['subject'],
        $data['body'],
        $data['body_type'] === 'html'
    );
} elseif ($account->connection_type === 'oauth') {
    // OAuth2-based SMTP
    $smtpService->sendViaOAuth(
        $account->email,
        $account->display_name,
        $to,
        $cc,
        $bcc,
        $data['subject'],
        $data['body'],
        $decryptedAccessToken
    );
}
```

---

## Security Features

✅ **SSL/TLS Encryption**
- STARTTLS (port 587)
- Implicit SSL (port 465)

✅ **Connection Validation**
- Test connection before saving
- Detailed error messages

✅ **Token Protection**
- OAuth tokens encrypted in database
- Never logged in plaintext
- Separate from SMTP passwords

✅ **Error Handling**
- No sensitive data in error messages
- Detailed logging for debugging

---

## Benefits Over Raw Socket Implementation

| Feature | Raw Sockets | PHPMailer |
|---------|------------|-----------|
| Code complexity | High | Low |
| Error handling | Manual | Built-in |
| SMTP protocol | Manual implementation | Tested implementation |
| OAuth2 support | Not supported | Fully supported |
| STARTTLS | Basic | Robust |
| Character encoding | Manual | Automatic |
| MIME formatting | Manual | Automatic |
| Connection pooling | N/A | Built-in (SMTPKeepAlive) |
| Debugging | Limited | Detailed output |

---

## Migration Path

If you're migrating from raw sockets to PHPMailer:

1. ✅ Install PHPMailer (`composer require phpmailer/phpmailer`)
2. ✅ Replace SmtpService with new implementation
3. ✅ Clear Laravel cache (`php artisan cache:clear`)
4. ✅ Test existing SMTP accounts with Edit button
5. ✅ Enable OAuth2-based SMTP in EmailController

No database changes needed — SmtpService is backward compatible!

---

## Testing

### Test Password-Based SMTP

```bash
# Via the Edit SMTP modal in Accounts page
1. Click Settings/Edit on an SMTP account
2. Fill in credentials
3. Click "Test Connection"
4. Should show "✓ Connection successful!"
```

### Test OAuth2-Based SMTP

```bash
# In EmailController or via API
$account = ConnectedAccount::where('connection_type', 'oauth')->first();
$smtpService = new SmtpService();

$smtpService->sendViaOAuth(
    $account->email,
    $account->display_name,
    ['test@example.com' => 'Test'],
    [],
    [],
    'OAuth2 Test',
    'This email was sent via OAuth2 SMTP',
    decrypt($account->access_token)
);
```

---

## Future Enhancements

- [ ] Support for other OAuth providers (Gmail, etc.)
- [ ] Attachment support in SmtpService
- [ ] Bounce/complaint handling
- [ ] Message tracking
- [ ] Auto-retry on failure
