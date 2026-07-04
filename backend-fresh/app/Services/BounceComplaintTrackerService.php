<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

/**
 * Bounce & Complaint Tracker Service
 *
 * Tracks bounced emails and spam complaints to maintain sender reputation.
 * Automatically identifies problem recipients and poor sending patterns.
 */
class BounceComplaintTrackerService
{
    /**
     * Record a bounce (hard or soft)
     *
     * @param int $accountId Account ID
     * @param string $email Bounced email address
     * @param string $type 'hard' (permanent) or 'soft' (temporary)
     * @param string $reason Bounce reason/error message
     */
    public function recordBounce(int $accountId, string $email, string $type = 'soft', string $reason = ''): void
    {
        // Log the bounce
        DB::table('email_bounces')->insert([
            'account_id' => $accountId,
            'email' => strtolower($email),
            'bounce_type' => $type,
            'reason' => $reason,
            'created_at' => now(),
        ]);

        // For hard bounces, add to suppression list
        if ($type === 'hard') {
            $this->addToSuppressionList($accountId, $email, 'hard_bounce');
        }

        // Update bounce statistics
        $this->updateBounceStats($accountId);
    }

    /**
     * Record a spam complaint
     *
     * @param int $accountId Account ID
     * @param string $email Complaining email address
     * @param string $source Where complaint came from (user, ISP, etc)
     */
    public function recordComplaint(int $accountId, string $email, string $source = 'user'): void
    {
        // Log the complaint
        DB::table('email_complaints')->insert([
            'account_id' => $accountId,
            'email' => strtolower($email),
            'complaint_source' => $source,
            'created_at' => now(),
        ]);

        // Add to suppression list
        $this->addToSuppressionList($accountId, $email, 'complaint');

        // Update complaint statistics
        $this->updateComplaintStats($accountId);
    }

    /**
     * Check if email is on suppression list
     */
    public function isSupressed(int $accountId, string $email): bool
    {
        $email = strtolower($email);

        return DB::table('email_suppressions')
            ->where('account_id', $accountId)
            ->where('email', $email)
            ->where('status', 'active')
            ->exists();
    }

    /**
     * Get suppression list for account
     */
    public function getSuppressionList(int $accountId, int $limit = 100, int $offset = 0): array
    {
        $suppressions = DB::table('email_suppressions')
            ->where('account_id', $accountId)
            ->where('status', 'active')
            ->orderBy('created_at', 'desc')
            ->limit($limit)
            ->offset($offset)
            ->get();

        $total = DB::table('email_suppressions')
            ->where('account_id', $accountId)
            ->where('status', 'active')
            ->count();

        return [
            'suppressions' => $suppressions->toArray(),
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
        ];
    }

    /**
     * Get bounce statistics
     */
    public function getBounceStats(int $accountId): array
    {
        $bouncesCacheKey = "account:{$accountId}:bounce_stats";
        $stats = Cache::get($bouncesCacheKey, [
            'total_bounces' => 0,
            'hard_bounces' => 0,
            'soft_bounces' => 0,
            'bounce_rate' => 0,
            'last_updated' => now(),
        ]);

        return $stats;
    }

    /**
     * Get complaint statistics
     */
    public function getComplaintStats(int $accountId): array
    {
        $complaintCacheKey = "account:{$accountId}:complaint_stats";
        $stats = Cache::get($complaintCacheKey, [
            'total_complaints' => 0,
            'complaint_rate' => 0,
            'last_updated' => now(),
        ]);

        return $stats;
    }

    /**
     * Get bounce report for last N days
     */
    public function getBounceReport(int $accountId, int $days = 7): array
    {
        $startDate = now()->subDays($days);

        $bouncesByDay = DB::table('email_bounces')
            ->where('account_id', $accountId)
            ->where('created_at', '>=', $startDate)
            ->selectRaw('DATE(created_at) as date, COUNT(*) as count, bounce_type')
            ->groupBy('date', 'bounce_type')
            ->get();

        $bouncesByReason = DB::table('email_bounces')
            ->where('account_id', $accountId)
            ->where('created_at', '>=', $startDate)
            ->selectRaw('reason, COUNT(*) as count')
            ->groupBy('reason')
            ->orderByDesc('count')
            ->limit(10)
            ->get();

        return [
            'period_days' => $days,
            'start_date' => $startDate,
            'end_date' => now(),
            'bounces_by_day' => $bouncesByDay->toArray(),
            'top_bounce_reasons' => $bouncesByReason->toArray(),
            'total_bounces' => $bouncesByDay->sum('count'),
        ];
    }

    /**
     * Get complaint report for last N days
     */
    public function getComplaintReport(int $accountId, int $days = 7): array
    {
        $startDate = now()->subDays($days);

        $complaintsByDay = DB::table('email_complaints')
            ->where('account_id', $accountId)
            ->where('created_at', '>=', $startDate)
            ->selectRaw('DATE(created_at) as date, COUNT(*) as count')
            ->groupBy('date')
            ->get();

        $complaintsBySource = DB::table('email_complaints')
            ->where('account_id', $accountId)
            ->where('created_at', '>=', $startDate)
            ->selectRaw('complaint_source, COUNT(*) as count')
            ->groupBy('complaint_source')
            ->get();

        return [
            'period_days' => $days,
            'start_date' => $startDate,
            'end_date' => now(),
            'complaints_by_day' => $complaintsByDay->toArray(),
            'complaints_by_source' => $complaintsBySource->toArray(),
            'total_complaints' => $complaintsByDay->sum('count'),
        ];
    }

    /**
     * Remove email from suppression list (when user opts back in)
     */
    public function removeFromSuppression(int $accountId, string $email): bool
    {
        return DB::table('email_suppressions')
            ->where('account_id', $accountId)
            ->where('email', strtolower($email))
            ->update(['status' => 'removed', 'removed_at' => now()]) > 0;
    }

    /**
     * Get health score based on bounce/complaint rates
     */
    public function getHealthScore(int $accountId): array
    {
        $bounceStats = $this->getBounceStats($accountId);
        $complaintStats = $this->getComplaintStats($accountId);

        $score = 100;
        $issues = [];

        // Bounce rate penalty
        $bounceRate = $bounceStats['bounce_rate'] ?? 0;
        if ($bounceRate > 5) {
            $score -= 30;
            $issues[] = "High bounce rate ({$bounceRate}%)";
        } elseif ($bounceRate > 2) {
            $score -= 15;
            $issues[] = "Moderate bounce rate ({$bounceRate}%)";
        }

        // Complaint rate penalty
        $complaintRate = $complaintStats['complaint_rate'] ?? 0;
        if ($complaintRate > 0.5) {
            $score -= 40;
            $issues[] = "High complaint rate ({$complaintRate}%)";
        } elseif ($complaintRate > 0.1) {
            $score -= 20;
            $issues[] = "Elevated complaint rate ({$complaintRate}%)";
        }

        return [
            'health_score' => max(0, $score),
            'bounce_rate' => $bounceRate,
            'complaint_rate' => $complaintRate,
            'issues' => $issues,
            'status' => $this->getHealthStatus($score),
        ];
    }

    /**
     * Add email to suppression list
     */
    private function addToSuppressionList(int $accountId, string $email, string $reason): void
    {
        $email = strtolower($email);

        // Check if already suppressed
        if (DB::table('email_suppressions')
            ->where('account_id', $accountId)
            ->where('email', $email)
            ->exists()) {
            return;
        }

        DB::table('email_suppressions')->insert([
            'account_id' => $accountId,
            'email' => $email,
            'reason' => $reason,
            'status' => 'active',
            'created_at' => now(),
        ]);
    }

    /**
     * Update bounce statistics in cache
     */
    private function updateBounceStats(int $accountId): void
    {
        $totalBounces = DB::table('email_bounces')
            ->where('account_id', $accountId)
            ->where('created_at', '>=', now()->subDays(7))
            ->count();

        $hardBounces = DB::table('email_bounces')
            ->where('account_id', $accountId)
            ->where('bounce_type', 'hard')
            ->where('created_at', '>=', now()->subDays(7))
            ->count();

        $softBounces = DB::table('email_bounces')
            ->where('account_id', $accountId)
            ->where('bounce_type', 'soft')
            ->where('created_at', '>=', now()->subDays(7))
            ->count();

        // Estimate total emails sent this week
        $totalSent = Cache::get("account:{$accountId}:emails_sent_week", 100);
        $bounceRate = $totalSent > 0 ? ($totalBounces / $totalSent) * 100 : 0;

        $stats = [
            'total_bounces' => $totalBounces,
            'hard_bounces' => $hardBounces,
            'soft_bounces' => $softBounces,
            'bounce_rate' => round($bounceRate, 2),
            'last_updated' => now(),
        ];

        Cache::put("account:{$accountId}:bounce_stats", $stats, now()->addDay());
    }

    /**
     * Update complaint statistics in cache
     */
    private function updateComplaintStats(int $accountId): void
    {
        $totalComplaints = DB::table('email_complaints')
            ->where('account_id', $accountId)
            ->where('created_at', '>=', now()->subDays(7))
            ->count();

        // Estimate total emails sent this week
        $totalSent = Cache::get("account:{$accountId}:emails_sent_week", 100);
        $complaintRate = $totalSent > 0 ? ($totalComplaints / $totalSent) * 100 : 0;

        $stats = [
            'total_complaints' => $totalComplaints,
            'complaint_rate' => round($complaintRate, 4),
            'last_updated' => now(),
        ];

        Cache::put("account:{$accountId}:complaint_stats", $stats, now()->addDay());
    }

    /**
     * Get health status based on score
     */
    private function getHealthStatus(int $score): string
    {
        if ($score >= 90) return 'excellent';
        if ($score >= 70) return 'good';
        if ($score >= 50) return 'fair';
        if ($score >= 30) return 'poor';
        return 'critical';
    }
}
