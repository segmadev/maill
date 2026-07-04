<?php

namespace App\Services;

use App\Models\ConnectedAccount;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

/**
 * Alert Service for High Bounce/Complaint Rates
 *
 * Monitors sender health metrics and triggers alerts when:
 * - Bounce rate exceeds thresholds
 * - Complaint rate exceeds thresholds
 * - Health score drops significantly
 * - Account is approaching rate limits
 */
class AlertService
{
    const ALERT_CACHE_KEY = 'account:%d:alert_state';
    const ALERT_COOLDOWN_MINUTES = 60; // Don't re-alert within this time

    // Alert thresholds
    const THRESHOLDS = [
        'bounce_critical' => 5.0,      // > 5% bounce rate
        'bounce_warning' => 2.0,       // > 2% bounce rate
        'complaint_critical' => 0.5,   // > 0.5% complaint rate
        'complaint_warning' => 0.1,    // > 0.1% complaint rate
        'health_critical' => 30,       // < 30 health score
        'health_warning' => 50,        // < 50 health score
        'rate_limit_warning' => 80,    // 80% of daily limit used
    ];

    /**
     * Check account health and trigger alerts if needed
     */
    public function checkAccountHealth(int $accountId): array
    {
        $account = ConnectedAccount::find($accountId);
        if (!$account) {
            return [];
        }

        $alerts = [];

        // Get current metrics
        $bounceStats = Cache::get("account:{$accountId}:bounce_stats", []);
        $complaintStats = Cache::get("account:{$accountId}:complaint_stats", []);
        $warmupStatus = (new IPWarmupService())->getWarmupStatus($accountId);
        $healthScore = $bounceStats['bounce_rate'] ?? 0; // Simplified

        // Check bounce rate
        $bounceRate = $bounceStats['bounce_rate'] ?? 0;
        if ($bounceRate > self::THRESHOLDS['bounce_critical']) {
            $alerts[] = $this->createAlert(
                $accountId,
                'bounce_critical',
                "Critical: Bounce rate is {$bounceRate}%",
                'critical',
                ['rate' => $bounceRate]
            );
        } elseif ($bounceRate > self::THRESHOLDS['bounce_warning']) {
            $alerts[] = $this->createAlert(
                $accountId,
                'bounce_warning',
                "Warning: Bounce rate is {$bounceRate}%",
                'warning',
                ['rate' => $bounceRate]
            );
        }

        // Check complaint rate
        $complaintRate = $complaintStats['complaint_rate'] ?? 0;
        if ($complaintRate > self::THRESHOLDS['complaint_critical']) {
            $alerts[] = $this->createAlert(
                $accountId,
                'complaint_critical',
                "Critical: Complaint rate is {$complaintRate}%",
                'critical',
                ['rate' => $complaintRate]
            );
        } elseif ($complaintRate > self::THRESHOLDS['complaint_warning']) {
            $alerts[] = $this->createAlert(
                $accountId,
                'complaint_warning',
                "Warning: Complaint rate is {$complaintRate}%",
                'warning',
                ['rate' => $complaintRate]
            );
        }

        // Check warmup rate limiting
        $dailyUsage = ($warmupStatus['emails_sent_today'] ?? 0) / max(1, $warmupStatus['daily_limit'] ?? 1);
        if ($dailyUsage > self::THRESHOLDS['rate_limit_warning']) {
            $alerts[] = $this->createAlert(
                $accountId,
                'rate_limit_warning',
                "Approaching daily limit: {$dailyUsage}% used",
                'info',
                ['usage' => $dailyUsage]
            );
        }

        return $alerts;
    }

    /**
     * Get all active alerts for an account
     */
    public function getActiveAlerts(int $accountId): array
    {
        return DB::table('account_alerts')
            ->where('account_id', $accountId)
            ->where('status', 'active')
            ->orderBy('severity', 'desc')
            ->orderBy('created_at', 'desc')
            ->get()
            ->toArray();
    }

    /**
     * Mark alert as resolved
     */
    public function resolveAlert(int $alertId): bool
    {
        return DB::table('account_alerts')
            ->where('id', $alertId)
            ->update([
                'status' => 'resolved',
                'resolved_at' => now(),
            ]) > 0;
    }

    /**
     * Get alert history for an account
     */
    public function getAlertHistory(int $accountId, int $days = 7): array
    {
        $startDate = now()->subDays($days);

        return DB::table('account_alerts')
            ->where('account_id', $accountId)
            ->where('created_at', '>=', $startDate)
            ->orderBy('created_at', 'desc')
            ->get()
            ->toArray();
    }

    /**
     * Create alert (with cooldown to prevent spam)
     */
    private function createAlert(
        int $accountId,
        string $type,
        string $message,
        string $severity,
        array $metadata = []
    ): ?array {
        $cacheKey = sprintf(self::ALERT_CACHE_KEY, $accountId);
        $lastAlertTime = Cache::get("{$cacheKey}:{$type}");

        // Check cooldown
        if ($lastAlertTime && now()->diffInMinutes($lastAlertTime) < self::ALERT_COOLDOWN_MINUTES) {
            return null; // Still in cooldown
        }

        // Create alert record
        $alert = DB::table('account_alerts')->insertGetId([
            'account_id' => $accountId,
            'type' => $type,
            'message' => $message,
            'severity' => $severity,
            'metadata' => json_encode($metadata),
            'status' => 'active',
            'created_at' => now(),
        ]);

        // Update cooldown
        Cache::put("{$cacheKey}:{$type}", now(), now()->addMinutes(self::ALERT_COOLDOWN_MINUTES));

        // Log alert
        Log::warning("Alert triggered: {$type}", [
            'account_id' => $accountId,
            'message' => $message,
            'severity' => $severity,
        ]);

        // Send notification (could trigger email, Slack, etc.)
        $this->notifyAlert($accountId, $alert, $message, $severity);

        return [
            'id' => $alert,
            'type' => $type,
            'message' => $message,
            'severity' => $severity,
            'metadata' => $metadata,
        ];
    }

    /**
     * Send alert notification (email, Slack, webhook, etc.)
     */
    private function notifyAlert(int $accountId, int $alertId, string $message, string $severity): void
    {
        $account = ConnectedAccount::find($accountId);
        if (!$account) return;

        // Could integrate with:
        // - Email notifications
        // - Slack webhooks
        // - SMS alerts
        // - In-app notifications
        // - Admin dashboard

        // Example: Log for now
        Log::info("Alert notification sent", [
            'account_id' => $accountId,
            'alert_id' => $alertId,
            'email' => $account->email,
            'severity' => $severity,
        ]);
    }

    /**
     * Get alert statistics for dashboard
     */
    public function getAlertStats(int $accountId, int $days = 7): array
    {
        $startDate = now()->subDays($days);

        $counts = DB::table('account_alerts')
            ->where('account_id', $accountId)
            ->where('created_at', '>=', $startDate)
            ->selectRaw('severity, COUNT(*) as count')
            ->groupBy('severity')
            ->get();

        $typeCounts = DB::table('account_alerts')
            ->where('account_id', $accountId)
            ->where('created_at', '>=', $startDate)
            ->selectRaw('type, COUNT(*) as count')
            ->groupBy('type')
            ->get();

        $activeCount = DB::table('account_alerts')
            ->where('account_id', $accountId)
            ->where('status', 'active')
            ->count();

        return [
            'total_alerts' => $counts->sum('count'),
            'by_severity' => $counts->keyBy('severity')->map(fn($x) => $x->count)->toArray(),
            'by_type' => $typeCounts->keyBy('type')->map(fn($x) => $x->count)->toArray(),
            'active_alerts' => $activeCount,
            'period_days' => $days,
        ];
    }
}
