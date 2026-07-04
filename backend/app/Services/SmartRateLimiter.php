<?php

namespace App\Services;

use App\Models\ConnectedAccount;
use App\Models\IPSendStats;

class SmartRateLimiter
{
    /**
     * Check if we can send from this IP/account
     */
    public function canSendFromAccount(ConnectedAccount $account, int $dailyLimit = 500): bool
    {
        $today = today();

        $stats = IPSendStats::firstOrCreate(
            ['account_id' => $account->id, 'date' => $today],
            ['ip_address' => $account->ip_address ?? 'unknown']
        );

        // Check daily limit
        if ($stats->emails_sent >= $dailyLimit) {
            return false;
        }

        // Check if IP is flagged
        if ($stats->is_flagged) {
            return false;
        }

        // Check reputation score
        if ($stats->reputation_score < 30) {
            return false;
        }

        return true;
    }

    /**
     * Record a successful send
     */
    public function recordSend(ConnectedAccount $account): void
    {
        $today = today();

        $stats = IPSendStats::firstOrCreate(
            ['account_id' => $account->id, 'date' => $today],
            ['ip_address' => $account->ip_address ?? 'unknown']
        );

        $stats->increment('emails_sent');
        $stats->update(['emails_sent_last_hour' => $stats->emails_sent_last_hour + 1]);
    }

    /**
     * Record a bounce
     */
    public function recordBounce(ConnectedAccount $account, string $bounceType = 'soft'): void
    {
        $today = today();

        $stats = IPSendStats::firstOrCreate(
            ['account_id' => $account->id, 'date' => $today],
            ['ip_address' => $account->ip_address ?? 'unknown']
        );

        if ($bounceType === 'soft') {
            $stats->increment('soft_bounces');
        } else {
            $stats->increment('hard_bounces');
        }

        $stats->increment('bounces');

        // Update bounce rate
        $bounceRate = $stats->emails_sent > 0 ? ($stats->bounces / $stats->emails_sent) * 100 : 0;
        $stats->update(['bounce_rate' => $bounceRate]);

        // Flag if bounce rate too high
        if ($bounceRate > 5) {
            $stats->update([
                'is_flagged' => true,
                'status' => 'critical',
            ]);
        }
    }

    /**
     * Record a complaint
     */
    public function recordComplaint(ConnectedAccount $account): void
    {
        $today = today();

        $stats = IPSendStats::firstOrCreate(
            ['account_id' => $account->id, 'date' => $today],
            ['ip_address' => $account->ip_address ?? 'unknown']
        );

        $stats->increment('complaints');

        // Update complaint rate
        $complaintRate = $stats->emails_sent > 0 ? ($stats->complaints / $stats->emails_sent) * 100 : 0;
        $stats->update(['complaint_rate' => $complaintRate]);

        // Flag immediately on any complaint
        if ($complaintRate > 0) {
            $stats->update([
                'is_flagged' => true,
                'status' => 'critical',
            ]);
        }
    }

    /**
     * Record a block/rate limit
     */
    public function recordBlock(ConnectedAccount $account): void
    {
        $today = today();

        $stats = IPSendStats::firstOrCreate(
            ['account_id' => $account->id, 'date' => $today],
            ['ip_address' => $account->ip_address ?? 'unknown']
        );

        $stats->increment('blocks');

        // Flag if blocked too many times
        if ($stats->blocks >= 3) {
            $stats->update([
                'is_flagged' => true,
                'status' => 'warning',
            ]);
        }
    }

    /**
     * Reset hourly counter (call every hour)
     */
    public function resetHourlyLimits(): void
    {
        IPSendStats::where('date', today())
            ->update(['emails_sent_last_hour' => 0]);
    }

    /**
     * Calculate dynamic limit based on account age
     */
    public function getDynamicLimit(ConnectedAccount $account): int
    {
        $accountAge = $account->created_at->diffInDays(today());

        if ($accountAge < 3) {
            return 50;  // First 3 days: conservative
        } elseif ($accountAge < 7) {
            return 200;  // Week 1: gradual increase
        } else {
            return 500;  // Established: normal limit
        }
    }
}
