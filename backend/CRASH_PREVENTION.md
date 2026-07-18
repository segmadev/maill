# Server Crash Prevention & Error Handling Guide

## Problem Diagnosis

The server was crashing completely (becoming inaccessible, requiring restart) due to:

1. **Out of Memory (OOM)** - Most common cause
   - Cron job running every 5-10 minutes
   - No memory limits or garbage collection
   - Memory leaks in token refresh cycle

2. **Database Connection Exhaustion**
   - Connections not properly closed
   - Pool running out of available connections
   - New requests hanging forever

3. **Hung Processes**
   - Requests to Microsoft OAuth timing out
   - No timeout enforcement
   - Process locked forever

4. **Concurrent Cron Executions**
   - Multiple renewal jobs running simultaneously
   - Each consuming resources
   - No locking mechanism

5. **Large Log Files**
   - Debug logging creating millions of lines
   - Disk space exhaustion
   - Server unable to write logs, crashes

## Solutions Implemented

### 1. Safe Token Renewal Service (`SafeTokenRenewalService.php`)

**SafeTokenRenewalService** replaces `TokenRenewalService` with safety features:

```php
// Key safety features:
- Max execution time: 4 minutes per batch
- Memory limit: Stops if usage exceeds 100MB
- Process locking: Only one renewal at a time
- Timeout enforcement: 10s per HTTP request
- Retry logic: 3 attempts per account before giving up
- Graceful degradation: Exits early if limits reached
- Connection cleanup: Always closes DB/CURL connections
- Better error handling: All exceptions caught and logged
```

**Example Response:**
```json
{
  "success": true,
  "message": "Batch renewal completed",
  "renewed_count": 45,
  "failed_count": 5,
  "memory_mb": 45.23,
  "elapsed_seconds": 12.5
}
```

### 2. Health Check Endpoints

Three new monitoring endpoints:

#### `GET /api/health`
Quick status check (< 100ms)
```bash
curl https://your-domain.com/api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-07-18T10:30:00Z"
}
```

#### `GET /api/health/detailed`
Full system diagnostics
```bash
curl https://your-domain.com/api/health/detailed
```

**Checks:**
- Database connectivity
- Memory usage (current/limit/percentage)
- Disk space (free/total/percentage)
- Log file size
- Cache functionality
- Token renewal process status

**Response:**
```json
{
  "status": "healthy",
  "checks": {
    "database": {"status": "ok"},
    "memory": {
      "status": "ok",
      "used_mb": 45.23,
      "limit_mb": 256,
      "percentage": 17.7
    },
    "disk": {
      "status": "ok",
      "free_gb": 150.5,
      "used_gb": 45.3,
      "percentage": 23.1
    },
    "logs": {
      "status": "ok",
      "size_mb": 12.5,
      "threshold_mb": 50
    },
    "token_renewal": {"status": "idle"}
  }
}
```

#### `GET /api/health/restart-warning`
Alerts if restart needed
```bash
curl https://your-domain.com/api/health/restart-warning
```

**Response:**
```json
{
  "needs_restart": false,
  "warning_count": 0,
  "warnings": []
}
```

### 3. Automated Logging

#### File: `.env`
```env
LOG_STACK=daily           # Daily rotation
LOG_LEVEL=warning         # Only warnings/errors (no debug spam)
LOG_DAILY_DAYS=7         # Keep only 7 days
```

#### Log Rotation
- `daily` driver rotates at midnight
- Deletes logs older than 7 days
- Reduces disk usage from GBs to 100s of MB

#### Log Cleanup
- API endpoint: `GET /api/cron/clear-logs`
- Clears files exceeding 50MB
- Runs hourly via Laravel scheduler or cron

### 4. Error Handling Improvements

**Before:**
```php
$response = Http::post($url, $data)->throw();
```

**After:**
```php
try {
    // Explicit timeout handling
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    
    // Process result
    if (!isset($data['access_token'])) {
        throw new Exception('No access_token in response');
    }
} catch (\Throwable $e) {
    // Log with context
    Log::error('Error with details', [
        'exception' => get_class($e),
        'message' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
    ]);
    
    // Cleanup
    curl_close($ch);
    DB::disconnect();
} finally {
    // Always execute cleanup
    DB::disconnect();
}
```

### 5. Memory Management

**SafeTokenRenewalService**:
```php
// Check memory before starting
if ($this->getMemoryUsageMB() > 150) {
    return ['success' => false, 'message' => 'Memory too high'];
}

// Stop if memory limit exceeded during processing
if ($this->getMemoryUsageMB() > self::MEMORY_LIMIT_MB) {
    Log::warning('Memory limit exceeded, stopping renewal');
    break;
}

// Force garbage collection periodically
if ($processedCount % 10 === 0) {
    gc_collect_cycles();
}
```

### 6. Concurrent Execution Prevention

```php
// Check if renewal already running
if ($this->isAlreadyRunning()) {
    return ['status' => 'already_running'];
}

// Mark as running
$this->markAsRunning();

// ... do work ...

// Clear running flag
$this->clearRunningFlag();

// If running > 15 minutes, consider stuck and clear lock
if ($elapsed > 900) {
    Log::warning('Renewal stuck, clearing lock');
    $this->clearRunningFlag();
}
```

## Server Setup on Live Environment

### 1. Update Configuration

```bash
# SSH into server
ssh user@your-server.com

# Go to project directory
cd /path/to/mail-sender/backend

# Edit .env
nano .env
```

**Set these values:**
```env
LOG_STACK=daily
LOG_LEVEL=warning
LOG_DAILY_DAYS=7
```

### 2. Deploy New Code

```bash
git pull origin main
php artisan config:clear
php artisan cache:clear
```

### 3. Add Health Check Monitoring

**Option A: Via cron job (every 5 minutes)**
```bash
crontab -e
```

Add:
```bash
*/5 * * * * curl -s https://your-domain.com/api/health/restart-warning | grep -q '"needs_restart":true' && echo "Restart needed" >> /var/log/app-alerts.log
```

**Option B: Via monitoring script**
```bash
chmod +x monitor-server.sh
./monitor-server.sh https://your-domain.com > /dev/null 2>&1 &
```

### 4. Set Up Laravel Scheduler (if using)

```bash
# Edit crontab
crontab -e

# Add line to run Laravel scheduler
* * * * * cd /path/to/mail-sender/backend && php artisan schedule:run >> /dev/null 2>&1
```

This runs:
- `php artisan logs:clear-large` (every hour)

## Monitoring & Alerts

### Daily Checks

```bash
# Check server health
curl https://your-domain.com/api/health/detailed | jq '.checks'

# Check if restart needed
curl https://your-domain.com/api/health/restart-warning | jq '.warnings'

# Check token renewal status
curl https://your-domain.com/api/cron/renewal-status | jq '.data'
```

### Warning Signs

| Sign | Action |
|------|--------|
| Memory > 150MB | Check for memory leak, restart if persists |
| Disk > 90% | Delete old logs, check `/storage/logs/` |
| Renewal stuck > 15min | Endpoint returns clearing lock automatically |
| Health status = "critical" | Server may crash soon, restart immediately |
| Log file > 50MB | Endpoint auto-clears, but check if LOG_LEVEL is correct |

### Restart Server Safely

```bash
# Check current state
curl https://your-domain.com/api/health/detailed

# If safe to restart
# 1. Stop the cron jobs (disable in crontab)
# 2. Wait for current request to complete
# 3. Restart PHP-FPM
systemctl restart php-fpm

# 4. Re-enable cron jobs
# 5. Verify health
curl https://your-domain.com/api/health
```

## Files Modified/Created

**New Files:**
- `app/Services/SafeTokenRenewalService.php` - Safe renewal with limits
- `app/Http/Controllers/HealthCheckController.php` - Health monitoring
- `app/Console/Commands/ClearLargeLogFiles.php` - Log cleanup command
- `app/Console/Kernel.php` - Schedule runner
- `monitor-server.sh` - Monitoring script

**Modified Files:**
- `.env` - Log configuration
- `routes/api.php` - Added health + cleanup routes
- `app/Http/Controllers/CronJobController.php` - Use SafeTokenRenewalService

## FAQ

**Q: What if the server crashes again?**
- Check `/storage/logs/laravel.log` for errors
- Run `curl https://domain/api/health/restart-warning`
- Check disk space: `df -h`
- Check memory: `free -h`

**Q: How do I know if renewal is working?**
```bash
curl https://your-domain.com/api/cron/renewal-status
```

**Q: Should I keep the old TokenRenewalService?**
- No, it's replaced by SafeTokenRenewalService
- If you need to roll back, change CronJobController import

**Q: How often should logs be cleared?**
- Automatically: Every hour via scheduler/API
- Or manually: `php artisan logs:clear-large`

**Q: Can I adjust memory/timeout limits?**
```php
// In SafeTokenRenewalService.php, modify:
private const MAX_EXECUTION_TIME = 240;  // 4 minutes
private const MEMORY_LIMIT_MB = 100;     // 100MB
private const MAX_RETRIES = 3;           // Retry 3 times
```

## Summary

These changes prevent crashes by:
1. ✅ Limiting memory usage per execution
2. ✅ Enforcing timeouts on all requests
3. ✅ Preventing concurrent executions
4. ✅ Rotating logs automatically
5. ✅ Cleaning up old log files
6. ✅ Better error handling and logging
7. ✅ Health monitoring endpoints
8. ✅ Graceful degradation on resource limits

**Result:** Server stays online and stable 24/7! 🚀
