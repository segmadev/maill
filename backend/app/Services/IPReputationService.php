<?php

namespace App\Services;

use App\Models\ConnectedAccount;
use App\Models\IPBlacklistCheck;
use App\Models\IPSendStats;
use Illuminate\Support\Facades\Log;

class IPReputationService
{
    /**
     * Check if IP is blacklisted
     */
    public function isBlacklisted(string $ip): bool
    {
        $blacklist = IPBlacklistCheck::where('ip_address', $ip)
            ->where('expires_at', '>', now())
            ->first();

        if ($blacklist) {
            return $blacklist->is_blacklisted;
        }

        // Perform fresh check (in production, query actual blacklist services)
        // For now, we assume IPs are good unless marked otherwise
        $this->checkIPBlacklist($ip);

        return false;
    }

    /**
     * Get IP reputation score (0-100)
     */
    public function getIPReputationScore(string $ip): int
    {
        $blacklist = IPBlacklistCheck::where('ip_address', $ip)
            ->where('expires_at', '>', now())
            ->first();

        if ($blacklist) {
            return $blacklist->reputation_score;
        }

        return 100;  // Default: excellent
    }

    /**
     * Check IP blacklist status
     */
    private function checkIPBlacklist(string $ip): void
    {
        try {
            // In production, query actual blacklist services like Spamhaus, Barracuda, etc
            // For now, we just cache that it was checked

            IPBlacklistCheck::updateOrCreate(
                ['ip_address' => $ip],
                [
                    'is_blacklisted' => false,
                    'lists_flagged' => json_encode([]),
                    'reputation_score' => 100,
                    'check_time' => now(),
                    'expires_at' => now()->addDay(),
                ]
            );
        } catch (\Exception $e) {
            Log::warning("Failed to check blacklist for IP {$ip}: {$e->getMessage()}");
        }
    }

    /**
     * Monitor and update daily send stats
     */
    public function monitorDailySendStats(ConnectedAccount $account, string $date = null): IPSendStats
    {
        $date = $date ?? today();

        $stats = IPSendStats::firstOrCreate(
            ['account_id' => $account->id, 'date' => $date],
            ['ip_address' => $account->ip_address ?? 'unknown']
        );

        // Calculate rates
        $bounceRate = $stats->emails_sent > 0 ? ($stats->bounces / $stats->emails_sent) * 100 : 0;
        $complaintRate = $stats->emails_sent > 0 ? ($stats->complaints / $stats->emails_sent) * 100 : 0;

        // Determine status and flag if needed
        $status = 'good';
        $reputation_score = 100;
        $is_flagged = false;

        if ($bounceRate > 5 || $complaintRate > 0.1 || $stats->blocks >= 3) {
            $is_flagged = true;

            if ($bounceRate > 10 || $complaintRate > 0.5 || $stats->blocks >= 5) {
                $status = 'critical';
                $reputation_score = max(20, 100 - (int)($bounceRate * 10));
            } else {
                $status = 'warning';
                $reputation_score = max(40, 100 - (int)($bounceRate * 5));
            }
        }

        $stats->update([
            'bounce_rate' => $bounceRate,
            'complaint_rate' => $complaintRate,
            'is_flagged' => $is_flagged,
            'status' => $status,
            'reputation_score' => $reputation_score,
        ]);

        // Update account IP reputation score
        $account->update(['ip_reputation_score' => $reputation_score]);

        return $stats;
    }

    /**
     * Flag account IP as problematic
     */
    public function flagIPForAccount(ConnectedAccount $account, string $reason = ''): void
    {
        $account->update(['is_ip_blacklisted' => true]);

        Log::warning("Account {$account->id} IP flagged. Reason: {$reason}");
    }

    /**
     * Unflag account IP
     */
    public function unflagIPForAccount(ConnectedAccount $account): void
    {
        $account->update(['is_ip_blacklisted' => false]);

        Log::info("Account {$account->id} IP unflagged");
    }
}
