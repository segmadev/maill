# Token Renewal Cron Job Setup Guide

## Overview
This system automatically renews OAuth tokens for all connected accounts before they expire. It processes accounts in batches to handle large-scale deployments efficiently.

## How It Works
1. **Batching**: Processes 50 accounts at a time
2. **Loop Processing**: Continues through all accounts, then restarts
3. **Renewal Buffer**: Renews tokens 30 minutes before expiry
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

### 2. Configure Cron Secret (Optional but Recommended)
Add to `.env`:
```env
CRON_SECRET=your-secret-token-here
```

### 3. Setup Cron Job Scheduler

#### Option A: Linux/Unix Cron
Add to your server's crontab (`crontab -e`):

**Every 5 minutes:**
```bash
*/5 * * * * curl -X POST \
  "https://your-domain.com/api/cron/renew-tokens" \
  -H "X-Cron-Secret: your-secret-token-here" \
  -H "Content-Type: application/json" \
  >> /var/log/mail-sender-cron.log 2>&1
```

**Every 10 minutes:**
```bash
*/10 * * * * curl -X POST \
  "https://your-domain.com/api/cron/renew-tokens" \
  -H "X-Cron-Secret: your-secret-token-here" \
  -H "Content-Type: application/json" \
  >> /var/log/mail-sender-cron.log 2>&1
```

#### Option B: Windows Task Scheduler
Create a task that runs:
```batch
curl -X POST ^
  "https://your-domain.com/api/cron/renew-tokens" ^
  -H "X-Cron-Secret: your-secret-token-here" ^
  -H "Content-Type: application/json"
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

### 1. Trigger Token Renewal (POST)
```
POST /api/cron/renew-tokens
Headers:
  X-Cron-Secret: your-secret-token-here

Response:
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

### Check Renewal Progress
```bash
# Get current status
curl "https://your-domain.com/api/cron/renewal-status"

# Get accounts needing re-auth
curl "https://your-domain.com/api/cron/accounts-requiring-reauth"
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

**For optimal token renewal:**
- **Every 5 minutes**: Safest, ensures no token expires
  - Handles up to 600 accounts per hour (50 accounts × 12 cycles)
  
- **Every 10 minutes**: Good balance
  - Handles up to 300 accounts per hour (50 accounts × 6 cycles)

**Example timeline for 1000 accounts:**
- At 5-min intervals: All 1000 accounts renewed in ~100 minutes
- At 10-min intervals: All 1000 accounts renewed in ~200 minutes

## How Renewal Works

1. **Every execution**:
   - Check if renewal cycle is complete
   - If complete, reset and start new cycle
   - Get next 50 accounts that need renewal
   - Renew their tokens
   - Save progress

2. **For each account**:
   - Check if token expires within 30 minutes
   - Call Microsoft OAuth refresh endpoint
   - Update token and expiry time
   - If refresh fails (invalid_grant), mark for re-authentication

3. **Progress tracking**:
   - Last processed account ID saved
   - Total count updated
   - Cycle completion flag set when all accounts done

## Security Considerations

1. **Cron Secret Header**: Use `X-Cron-Secret` to authenticate cron requests
   - Change the default secret
   - Use HTTPS only
   - Keep secret out of version control

2. **Rate Limiting**: Not applied to cron endpoints
   - Only call from trusted sources
   - Monitor for abuse

3. **Token Encryption**: Tokens stored encrypted in database
   - Decrypted only when renewing or sending emails
   - Never logged in plain text

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
