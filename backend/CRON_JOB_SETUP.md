# Token Renewal Cron Job Setup Guide

## Overview
This system automatically renews **ALL** OAuth tokens for connected accounts, regardless of expiry time. It processes accounts in continuous batches to handle large-scale deployments efficiently.

## How It Works
1. **Continuous Renewal**: Renews ALL tokens on every cycle, not just expiring ones
2. **Batching**: Processes 50 accounts at a time
3. **Loop Processing**: Continues through all accounts, then restarts from the beginning
4. **Progress Tracking**: Saves progress to database between batches
5. **Failure Handling**: Marks accounts requiring re-authentication

## Setup

### 1. Run Migration
```bash
php artisan migrate
```

This creates:
- `last_token_refresh_at` column on `connected_accounts` table
- `requires_reauthentication` column on `connected_accounts` table
- `system_status` table for tracking renewal progress

### 2. Setup Cron Job Scheduler

#### Option A: Linux/Unix Cron
Add to your server's crontab (`crontab -e`):

**Every 5 minutes:**
```bash
*/5 * * * * curl "https://your-domain.com/api/cron/renew-tokens" >> /var/log/mail-sender-cron.log 2>&1
```

**Every 10 minutes:**
```bash
*/10 * * * * curl "https://your-domain.com/api/cron/renew-tokens" >> /var/log/mail-sender-cron.log 2>&1
```

**To verify it works, test manually:**
```bash
curl "https://your-domain.com/api/cron/renew-tokens"
```

#### Option B: Windows Task Scheduler
Create a task that runs:
```batch
curl "https://your-domain.com/api/cron/renew-tokens"
```

Schedule it to run every 5-10 minutes.

#### Option C: Laravel Scheduler (If hosting on same server)
Add to `app/Console/Kernel.php`:
```php
protected function schedule(Schedule $schedule)
{
    $schedule->call(function () {
        $service = app(\App\Services\TokenRenewalService::class);
        $service->renewTokensBatch();
    })->everyFiveMinutes();
}
```

Then add to crontab:
```bash
* * * * * cd /path/to/project && php artisan schedule:run >> /dev/null 2>&1
```

## API Endpoints

### 1. Trigger Token Renewal (GET)
Public endpoint - can be called directly from browser or cron job:
```
GET /api/cron/renew-tokens
```

Response:
```json
{
  "success": true,
  "message": "Batch renewal completed",
  "renewed_count": 25,
  "failed_count": 2,
  "total_processed": 127,
  "batch_size": 50,
  "cycle_complete": false
}
```

Quick test (copy into browser address bar):
```
https://your-domain.com/api/cron/renew-tokens
```

### 2. Get Renewal Status (GET)
```
GET /api/cron/renewal-status

Response:
{
  "success": true,
  "data": {
    "status": "in_progress",
    "total_processed": 127,
    "renewed_count": 125,
    "failed_count": 2,
    "last_account_id": 987,
    "started_at": "2026-07-11T12:00:00.000Z",
    "completed_at": null
  }
}
```

### 3. Get Accounts Requiring Re-authentication (GET)
```
GET /api/cron/accounts-requiring-reauth

Response:
{
  "success": true,
  "count": 3,
  "accounts": [
    {
      "id": 45,
      "email": "user@example.com",
      "display_name": "John Doe",
      "last_token_refresh_at": "2026-07-11T12:15:30.000Z"
    },
    ...
  ]
}
```

## Monitoring

### Quick Test
Visit these URLs in your browser to test:

**Trigger renewal batch:**
```
https://your-domain.com/api/cron/renew-tokens
```

**Check renewal progress:**
```
https://your-domain.com/api/cron/renewal-status
```

**Get accounts needing re-auth:**
```
https://your-domain.com/api/cron/accounts-requiring-reauth
```

### View Logs
```bash
# Follow cron job logs
tail -f /var/log/mail-sender-cron.log

# Check Laravel logs
tail -f storage/logs/laravel.log
```

### Database Query
```sql
-- Check last renewal times
SELECT id, email, token_expires_at, last_token_refresh_at, requires_reauthentication
FROM connected_accounts
WHERE connection_type = 'oauth'
ORDER BY last_token_refresh_at DESC;

-- Check renewal progress
SELECT * FROM system_status WHERE key = 'token_renewal_progress';
```

## Recommended Schedule

**For continuous token renewal of ALL accounts:**
- **Every 5 minutes**: Renews tokens most frequently
  - Processes 50 accounts per call = 600 accounts/hour (10 cycles × 50)
  - All accounts renewed every ~100 min (for 1000 accounts)
  
- **Every 10 minutes**: Standard recommended interval
  - Processes 50 accounts per call = 300 accounts/hour (6 cycles × 50)
  - All accounts renewed every ~200 min (for 1000 accounts)

**Example timeline for 1000 accounts (10-min intervals):**
- Cycle 1: Renew accounts 1-50 (10 min)
- Cycle 2: Renew accounts 51-100 (20 min)
- Cycle 3: Renew accounts 101-150 (30 min)
- ...
- Cycle 20: Renew accounts 951-1000 (200 min)
- Cycle 21: Reset → Renew accounts 1-50 again (210 min)

## How Renewal Works

1. **Every execution**:
   - Check if renewal cycle is complete
   - If complete, reset and start new cycle from account 1
   - Get next 50 OAuth accounts (regardless of token expiry)
   - Renew their tokens
   - Save progress

2. **For each account**:
   - Call Microsoft OAuth refresh endpoint
   - Update token and expiry time
   - If refresh fails (invalid_grant), mark for re-authentication

3. **Progress tracking**:
   - Last processed account ID saved
   - Total count updated
   - Cycle completion flag set when all accounts done
   - Then automatically restarts from beginning

## Security Considerations

1. **Public Endpoint**: The cron endpoints are publicly accessible
   - Use HTTPS only in production
   - Rate limiting is not applied - only call from trusted cron sources
   - Consider using a cron service (cron-job.org, EasyCron) behind a firewall

2. **Token Encryption**: Tokens stored encrypted in database
   - Decrypted only when renewing or sending emails
   - Never logged in plain text

3. **HTTPS Requirement**: Always use HTTPS in production
   - Protects tokens in transit
   - Ensures only authorized servers can trigger renewal

## Troubleshooting

### Tokens not renewing
- Check cron job is actually running
- Verify X-Cron-Secret header matches config
- Check `/api/cron/renewal-status` for progress
- Review Laravel logs for errors

### Accounts require re-authentication frequently
- Indicate refresh token issues
- User may need to reconnect account
- Check `/api/cron/accounts-requiring-reauth` endpoint

### Performance issues with large account counts
- The system handles 50 accounts per batch
- Increase cron frequency (5-min vs 10-min)
- Or implement queue-based processing (future enhancement)

### High database load
- Consider increasing batch interval from 5 to 10 minutes
- Monitor query performance
- Ensure indexes on `token_expires_at` and `id`

## Database Indexes (Recommended)

```sql
CREATE INDEX idx_connected_accounts_oauth_expiry 
ON connected_accounts(connection_type, token_expires_at, id);

CREATE INDEX idx_connected_accounts_reauth 
ON connected_accounts(requires_reauthentication);
```
