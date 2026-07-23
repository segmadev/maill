# Backend-for-Frontend (BFF) OAuth Configuration

## Phase 1: Backend OAuth Handler Setup

This guide explains how to configure the new BFF OAuth system for supporting both web login and manual OAuth setup.

### Environment Variables

Add these to your `.env` file:

```env
# Frontend URL (for OAuth callback redirect)
FRONTEND_URL=http://localhost:3000

# Microsoft OAuth Configuration
MICROSOFT_OAUTH_CLIENT_ID=your_app_client_id
MICROSOFT_OAUTH_CLIENT_SECRET=your_app_client_secret

# Optional: Tenant ID (default is 'common' for multi-tenant)
MICROSOFT_OAUTH_TENANT=common

# OAuth Token Encryption (use an existing encryption key)
APP_KEY=base64:your_encryption_key

# Session Lifetime (in days)
SESSION_LIFETIME_DAYS=30

# Token Refresh Threshold (minutes before expiry to refresh)
TOKEN_REFRESH_BEFORE_MINUTES=5
```

### Database Migration

Run the migration to create the `oauth_sessions` table:

```bash
php artisan migrate
```

This creates a new table to store:
- Microsoft OAuth tokens (encrypted)
- Session information
- Token refresh tracking
- PKCE state for OAuth flow

### Middleware Registration

The `OAuthSessionMiddleware` is already registered in `bootstrap/app.php` as `oauth.session`.

It:
- Validates session cookies
- Auto-refreshes tokens if they expire within 5 minutes
- Enforces re-authentication if refresh fails
- Updates last activity timestamp

### Routes

New OAuth routes have been added to `routes/api.php`:

```
GET  /api/auth/microsoft/login       - Initiate Microsoft OAuth flow
GET  /api/auth/microsoft/callback    - Microsoft OAuth callback
GET  /api/auth/me                    - Get current user (requires oauth.session)
POST /api/auth/logout                - Logout and revoke tokens (requires oauth.session)
```

### Manual OAuth Setup Integration

Existing manual OAuth setup (where admins enter Client ID, Secret, Tenant) continues to work:

1. When an account has manual OAuth credentials stored in `connected_accounts` table
2. Backend reads those credentials from the database
3. Uses them for token exchange and refresh
4. Stores encrypted tokens in `oauth_sessions` table
5. BFF middleware handles automatic refresh

**No conflict** - Both web login and manual setup feed into the same token management system.

### Token Storage

Tokens are stored encrypted in the database:
- `microsoft_access_token` - Encrypted with APP_KEY
- `microsoft_refresh_token` - Encrypted with APP_KEY

They are never sent to React/frontend.

### Error Handling

If token refresh fails (e.g., invalid_grant), the session is marked as `requires_reauth = true`.

Frontend will receive a 401 response with:
```json
{
  "error": "requires_reauth",
  "message": "Please re-authenticate",
  "error_description": "error details..."
}
```

Frontend should redirect user to `/api/auth/microsoft/login` to re-authenticate.

### Testing Phase 1

1. Run migration: `php artisan migrate`
2. Test OAuth flow:
   ```
   GET http://localhost:8765/api/auth/microsoft/login
   → Browser redirects to Microsoft login
   → User authorizes
   → Browser redirects back to callback
   → Session created
   → Redirect to frontend dashboard
   ```
3. Test session endpoint:
   ```
   GET http://localhost:8765/api/auth/me
   → Returns current user and session info
   ```
4. Test auto-refresh:
   - Any API call to `/api/auth/me` automatically refreshes if needed
   - Middleware handles it invisibly

### Known Limitations (Phase 1)

- Frontend still uses old OAuth system (will be updated in Phase 3)
- Old and new systems run in parallel
- Use different routes to test:
  - Old: `/auth/*` routes
  - New: `/api/auth/*` routes

### Next Phase

Phase 2 will add middleware integration to automatically refresh tokens for existing API endpoints.

Phase 3 will update React frontend to use the new BFF routes.

