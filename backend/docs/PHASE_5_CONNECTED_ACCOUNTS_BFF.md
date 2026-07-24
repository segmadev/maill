# Phase 5: Connected Accounts BFF OAuth Extension

## Overview

Extend Backend-for-Frontend OAuth to all connected account types:
1. **Microsoft Account (OAuth)** - OAuth 2.0 with auto-refresh
2. **OAuth Authorization Flow** - Manual credential OAuth with auto-refresh
3. **SMTP Account** - Encrypted credential storage (no tokens)
4. **Both OAuth + SMTP** - Hybrid with both patterns

**Goal**: Make all account connections last indefinitely (solve 24-hour expiration)

## Architecture

### Token Storage Pattern

All connected accounts will store credentials/tokens encrypted in the database:

```
connected_accounts table (existing)
├── connection_type: 'oauth' | 'smtp' | 'hybrid'
├── encrypted_access_token (OAuth)
├── encrypted_refresh_token (OAuth)
├── token_expires_at (OAuth)
├── refresh_token_expires_at (OAuth)
├── last_token_refresh (timestamp)
├── requires_reauth (flag for expired tokens)
├── smtp_username (SMTP)
├── encrypted_smtp_password (SMTP)
└── oauth_client_id/secret (for re-auth)
```

### New Components

1. **ConnectedAccountTokenService** - Unified token/credential management
2. **GraphAPIMiddleware** - Auto-refresh on every Graph API call
3. **SMTPCredentialService** - Encrypt/decrypt SMTP passwords
4. **AccountConnectionController** - Handle BFF OAuth for accounts
5. **AccountReAuthFlow** - Re-auth when tokens expire

## Implementation Plan

### Step 1: Database Migrations
- Add encrypted credential columns to connected_accounts
- Add token refresh tracking columns
- Add requires_reauth flag

### Step 2: Token/Credential Services
- ConnectedAccountTokenService for OAuth token refresh
- SMTPCredentialService for password encryption
- Unified credential manager

### Step 3: Account Connection Flow
- Update OAuth authorization to use BFF pattern
- Store tokens encrypted immediately
- Create session for account

### Step 4: API Integration
- Update Graph API calls to use backend tokens
- Add middleware for auto-refresh
- Handle expired token scenarios

### Step 5: Re-Authentication
- Detect expired tokens
- Prompt user to re-authenticate
- Seamless re-auth without interrupting services

## Key Features

✅ OAuth tokens auto-refresh (5-minute buffer)
✅ SMTP passwords stored encrypted (no expiration)
✅ Sessions last indefinitely
✅ Graceful degradation for expired tokens
✅ Seamless re-auth when needed
✅ No frontend access to credentials
✅ Backward compatible with existing flows

## Benefits

| Issue | Before | After |
|-------|--------|-------|
| OAuth expiration | 24 hours max | Indefinite (auto-refresh) |
| SMTP credentials | Frontend exposed | Backend encrypted |
| Service crashes | Every 24 hours | Never |
| Re-auth UX | Unexpected logout | Smooth re-auth prompt |
| Security | Tokens in browser | Encrypted in database |

## Implementation Status

- [ ] Database migrations
- [ ] ConnectedAccountTokenService
- [ ] SMTPCredentialService
- [ ] Account connection flow update
- [ ] GraphAPI auto-refresh middleware
- [ ] Re-auth flow
- [ ] Testing & verification

## Timeline

Expected completion: Same session, following existing pattern
