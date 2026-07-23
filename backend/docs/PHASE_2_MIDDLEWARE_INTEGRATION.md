# Phase 2: Middleware Integration & Token Refresh on API Requests

## Overview

Phase 2 integrates the BFF OAuth system into existing API routes. Both JWT (old) and BFF OAuth (new) systems work in parallel, allowing seamless migration without downtime.

## New Components

### 1. ApiAuthMiddleware
Hybrid authentication middleware that supports both:
- **BFF OAuth** (new): HttpOnly session cookie
- **JWT Bearer** (old): Authorization header

Routes can use `middleware('api.auth')` to support both authentication methods.

### 2. OAuthMigrationService
Handles migration from JWT/manual OAuth to BFF OAuth:
- Migrates individual users: `migrateJwtUserToBFF()`
- Migrates connected accounts: `migrateAccountToBFF()`
- Bulk migration: `migrateAllUsers()`
- Handles expired tokens gracefully (marks for re-auth)

### 3. CurrentUserTokenService
Provides current access token regardless of auth method:
- Works with both BFF OAuth and JWT
- Automatically handles token refresh (BFF only)
- Returns authorization header ready for Graph API

### 4. Migration Console Command
```bash
# Migrate specific user
php artisan oauth:migrate-to-bff --user-id=42

# Migrate all users (dry-run to preview)
php artisan oauth:migrate-to-bff --dry-run

# Actually migrate all users
php artisan oauth:migrate-to-bff
```

## Key Features

✅ **Backward Compatible** - JWT still works, no breaking changes  
✅ **Seamless Migration** - Users can use both systems  
✅ **Graceful Degradation** - Expired tokens marked for re-auth  
✅ **Per-Request Token Refresh** - Automatic on every API call  
✅ **Token Access Service** - Unified interface for access tokens  

## Migration Strategy

### Option 1: Per-User Migration
Users migrate individually when they first log in with new system.

```
User logs in with OAuth → Creates BFF session
```

### Option 2: Bulk Migration
Run command to migrate all existing accounts.

```bash
php artisan oauth:migrate-to-bff
```

### Option 3: Hybrid Approach
- New users automatically use BFF OAuth
- Existing users migrate on-demand or bulk migrated later

## Expired Token Handling

If a user's refresh token is expired during migration:

1. **Detection**: Migration service checks `refresh_token_expires_at`
2. **Handling**: Creates session with `requires_reauth = true`
3. **User Experience**: Next API call returns 401 with re-auth prompt
4. **Fix**: User re-authenticates via `/api/auth/microsoft/login`

**Example flow:**
```
Migrated user with 24h-old token
→ Tries API call
→ OAuthSessionMiddleware detects requires_reauth
→ Returns 401 with re-auth message
→ Frontend redirects to Microsoft login
→ User completes one-click re-auth
→ Fresh tokens obtained
→ Smooth sailing from then on
```

## Using Current Access Token

Services that need the current access token:

```php
// Inject service
public function __construct(CurrentUserTokenService $tokenService)
{
    $this->tokenService = $tokenService;
}

// In a method
public function getData(Request $request)
{
    // Get token (works with both JWT and BFF)
    $token = $this->tokenService->getAccessToken($request);
    
    // Or get authorization header directly
    $authHeader = $this->tokenService->getAuthorizationHeader($request);
    
    // Make Graph API call with token
    // Middleware already auto-refreshed if needed
}
```

## Route Compatibility

### Old Routes (JWT only)
```php
Route::middleware('jwt')->group(function () {
    // Only works with Bearer token
});
```

### New Routes (Both systems)
```php
Route::middleware('api.auth')->group(function () {
    // Works with both JWT and BFF OAuth cookie
});
```

### Admin Routes (Both systems)
```php
Route::middleware('admin')->group(function () {
    // AdminMiddleware now supports both JWT and BFF
});
```

## Testing Phase 2

### Test JWT (Old System)
```bash
# Login with JWT
POST /api/login
Authorization: Bearer old_jwt_token

# Call protected endpoint
GET /api/accounts
Authorization: Bearer old_jwt_token
# Should work as before
```

### Test BFF OAuth (New System)
```bash
# Login with OAuth
GET /api/auth/microsoft/login
# → Redirects to Microsoft
# → User authorizes
# → Receives session cookie

# Call protected endpoint
GET /api/auth/me
Cookie: oauth_session=...
# Should return user info
```

### Test Migration
```bash
# Migrate user
php artisan oauth:migrate-to-bff --user-id=1

# Verify migration (check BFF session exists)
SELECT * FROM oauth_sessions WHERE user_id = 1;

# Test with new cookie
GET /api/auth/me
Cookie: oauth_session=...
# Should work
```

### Test Mixed Auth
```bash
# Same endpoint accessible with both auth methods
GET /api/accounts
# Authorization: Bearer jwt_token
# OR
# Cookie: oauth_session=...
```

## Migration Plan

1. **Immediate** (Phase 2):
   - Deploy new middleware and services
   - Both JWT and BFF work in parallel
   - No user-facing changes yet

2. **Week 1**:
   - Dry-run migration: `php artisan oauth:migrate-to-bff --dry-run`
   - Review results and fix issues
   - Migrate a test user: `php artisan oauth:migrate-to-bff --user-id=X`

3. **Week 2**:
   - Bulk migration: `php artisan oauth:migrate-to-bff`
   - Monitor re-auth prompts
   - Support users as needed

4. **Week 3+**:
   - Gradually sunset JWT routes
   - Users enjoy seamless long-lived sessions

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "No session" error | Migration didn't create session | Re-run migration for user |
| "Requires re-auth" | Refresh token was expired | User clicks re-auth, automatic re-login |
| Token not refreshing | Token service issue | Check logs for TokenManagementService errors |
| Mixed auth failing | Middleware misconfigured | Verify api.auth middleware is applied |

## Next Steps (Phase 3)

- Update React frontend to use BFF OAuth
- Remove MSAL dependency
- Redirect login to `/api/auth/microsoft/login`

