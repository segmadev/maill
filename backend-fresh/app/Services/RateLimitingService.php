<?php

namespace App\Services;

use App\Models\BulkCampaign;
use Illuminate\Support\Facades\Log;

/**
 * Rate Limiting Service
 *
 * Enforces rate limits across ALL campaigns for each account:
 * - Emails per hour (random range)
 * - Daily limit per account (random range)
 * - One campaign at a time per account
 */
class RateLimitingService
{
    /**
     * Check if an account can send emails based on rate limits
     * Looks at ALL running campaigns for the account
     */
    public function canSendEmails(int $accountId, array $campaignSettings): array
    {
        // Get all running/paused campaigns using this account
        $runningCampaigns = BulkCampaign::whereIn('status', ['running', 'paused'])
            ->get()
            ->filter(fn($c) => in_array($accountId, $c->selected_accounts))
            ->all();

        $totalSentToday = 0;
        $totalSentThisHour = 0;
        $now = now();
        $hourAgo = now()->subHour();

        // Sum up emails sent in last hour and today across all campaigns
        foreach ($runningCampaigns as $campaign) {
            // Count from batch history
            if ($campaign->batch_history) {
                foreach ($campaign->batch_history as $batch) {
                    $batchTime = isset($batch['sentAt']) ? new \DateTime($batch['sentAt']) : null;

                    if ($batchTime) {
                        // Count in last hour
                        if ($batchTime > $hourAgo->toDateTime()) {
                            $totalSentThisHour += $batch['sent'] ?? 0;
                        }
                        // Count today
                        if ($batchTime->format('Y-m-d') === $now->format('Y-m-d')) {
                            $totalSentToday += $batch['sent'] ?? 0;
                        }
                    }
                }
            }
        }

        // Get limit ranges from campaign settings
        $emailsPerHourRange = $campaignSettings['emailsPerHourRange'] ?? ['min' => 50, 'max' => 100];
        $dailyLimitRange = $campaignSettings['dailyLimitRange'] ?? ['min' => 500, 'max' => 1000];

        // Pick random limits for this hour/day (or use existing if campaign already started)
        $hourlyLimit = $emailsPerHourRange['max'];
        $dailyLimit = $dailyLimitRange['max'];

        // Check if limits exceeded
        $canSendThisHour = $totalSentThisHour < $hourlyLimit;
        $canSendToday = $totalSentToday < $dailyLimit;

        return [
            'can_send' => $canSendThisHour && $canSendToday,
            'hourly_limit' => $hourlyLimit,
            'daily_limit' => $dailyLimit,
            'sent_this_hour' => $totalSentThisHour,
            'sent_today' => $totalSentToday,
            'hourly_remaining' => max(0, $hourlyLimit - $totalSentThisHour),
            'daily_remaining' => max(0, $dailyLimit - $totalSentToday),
            'reason' => match (true) {
                !$canSendThisHour => "Hourly limit reached ({$totalSentThisHour}/{$hourlyLimit})",
                !$canSendToday => "Daily limit reached ({$totalSentToday}/{$dailyLimit})",
                default => null,
            },
        ];
    }

    /**
     * Check if account is busy (another campaign running)
     */
    public function isAccountBusy(int $accountId, ?int $currentCampaignId = null): bool
    {
        $runningCampaigns = BulkCampaign::where('status', 'running')
            ->when($currentCampaignId, fn($q) => $q->where('id', '!=', $currentCampaignId))
            ->get();

        foreach ($runningCampaigns as $campaign) {
            if (in_array($accountId, $campaign->selected_accounts)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Calculate delay needed before next batch
     */
    public function getNextBatchDelay(int $accountId, array $campaignSettings): int
    {
        $limits = $this->canSendEmails($accountId, $campaignSettings);

        if (!$limits['can_send']) {
            // If hourly limit hit, wait until next hour
            if ($limits['sent_this_hour'] >= $limits['hourly_limit']) {
                return 3600; // Wait 1 hour
            }
            // If daily limit hit, wait until next day
            return 86400; // Wait 24 hours
        }

        return 0; // Can send immediately
    }
}
