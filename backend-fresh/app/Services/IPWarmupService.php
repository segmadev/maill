<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Carbon\Carbon;

/**
 * IP Warmup & Rate Limiting Service
 *
 * Manages sending rate based on IP reputation and warmup schedule.
 * Prevents sending too many emails too fast, which causes poor reputation.
 */
class IPWarmupService
{
    private string $ipAddress;
    private string $domain;

    /**
     * Initialize with IP and domain
     */
    public function __construct(string $ipAddress = null, string $domain = null)
    {
        $this->ipAddress = $ipAddress ?? $this->getServerIP();
        $this->domain = $domain ?? 'default';
    }

    /**
     * Check if we can send emails now or need to rate-limit
     *
     * @param int $accountId Account ID
     * @param int $emailsToSend Number of emails user wants to send
     * @return array ['canSend' => bool, 'message' => string, 'delay' => int, 'maxPerHour' => int]
     */
    public function checkRateLimit(int $accountId, int $emailsToSend = 1): array
    {
        $cacheKey = "account:{$accountId}:send_stats";
        $stats = Cache::get($cacheKey, [
            'emails_sent_today' => 0,
            'emails_sent_this_hour' => 0,
            'first_send_at' => null,
            'account_age_days' => 0,
        ]);

        // Calculate warmup stage
        $warmupStage = $this->calculateWarmupStage($accountId);
        $limits = $this->getWarmupLimits($warmupStage);

        $dailyLimit = $limits['daily_limit'];
        $hourlyLimit = $limits['hourly_limit'];
        $minDelayBetweenEmails = $limits['min_delay_seconds'];

        // Check daily limit
        if ($stats['emails_sent_today'] + $emailsToSend > $dailyLimit) {
            return [
                'canSend' => false,
                'message' => "Daily limit ({$dailyLimit}) reached. Try again tomorrow.",
                'delay' => 3600 * 24,
                'maxPerHour' => $hourlyLimit,
                'dailySent' => $stats['emails_sent_today'],
                'dailyLimit' => $dailyLimit,
            ];
        }

        // Check hourly limit
        if ($stats['emails_sent_this_hour'] + $emailsToSend > $hourlyLimit) {
            $resetAt = Cache::get("account:{$accountId}:hour_reset", now()->addHour());
            $delay = $resetAt->diffInSeconds(now());

            return [
                'canSend' => false,
                'message' => "Hourly limit ({$hourlyLimit}) reached. Wait {$delay}s before next send.",
                'delay' => $delay,
                'maxPerHour' => $hourlyLimit,
                'hourlySent' => $stats['emails_sent_this_hour'],
                'hourlyLimit' => $hourlyLimit,
            ];
        }

        // Check min delay between emails
        $lastSendKey = "account:{$accountId}:last_send_time";
        $lastSendTime = Cache::get($lastSendKey);
        if ($lastSendTime) {
            $secondsSinceLastSend = now()->diffInSeconds($lastSendTime);
            if ($secondsSinceLastSend < $minDelayBetweenEmails) {
                $delay = $minDelayBetweenEmails - $secondsSinceLastSend;
                return [
                    'canSend' => false,
                    'message' => "Too fast! Wait {$delay}s before next email.",
                    'delay' => $delay,
                    'minDelay' => $minDelayBetweenEmails,
                ];
            }
        }

        // Can send!
        return [
            'canSend' => true,
            'message' => "OK to send {$emailsToSend} email(s)",
            'warmupStage' => $warmupStage,
            'dailySent' => $stats['emails_sent_today'],
            'dailyLimit' => $dailyLimit,
            'hourlySent' => $stats['emails_sent_this_hour'],
            'hourlyLimit' => $hourlyLimit,
        ];
    }

    /**
     * Record that emails were sent
     */
    public function recordSent(int $accountId, int $count = 1): void
    {
        $cacheKey = "account:{$accountId}:send_stats";
        $statsKey = "account:{$accountId}:hour_reset";

        $stats = Cache::get($cacheKey, [
            'emails_sent_today' => 0,
            'emails_sent_this_hour' => 0,
            'first_send_at' => now(),
        ]);

        $stats['emails_sent_today'] += $count;
        $stats['emails_sent_this_hour'] += $count;
        $stats['last_send_at'] = now();

        // Store stats for 24 hours
        Cache::put($cacheKey, $stats, now()->addDay());

        // Reset hourly counter at top of next hour
        if (!Cache::has($statsKey)) {
            $resetTime = now()->addHour()->setMinutes(0)->setSeconds(0);
            Cache::put($statsKey, $resetTime, $resetTime);
        }

        // Update last send time
        Cache::put("account:{$accountId}:last_send_time", now(), now()->addMinutes(5));
    }

    /**
     * Get warmup status and recommendations
     */
    public function getWarmupStatus(int $accountId): array
    {
        $warmupStage = $this->calculateWarmupStage($accountId);
        $limits = $this->getWarmupLimits($warmupStage);

        $cacheKey = "account:{$accountId}:send_stats";
        $stats = Cache::get($cacheKey, [
            'emails_sent_today' => 0,
            'emails_sent_this_hour' => 0,
            'first_send_at' => now(),
        ]);

        $daysSinceFirstSend = now()->diffInDays($stats['first_send_at']);

        return [
            'stage' => $warmupStage,
            'stage_description' => $this->getStageDescription($warmupStage),
            'daily_limit' => $limits['daily_limit'],
            'hourly_limit' => $limits['hourly_limit'],
            'min_delay_seconds' => $limits['min_delay_seconds'],
            'emails_sent_today' => $stats['emails_sent_today'],
            'days_sending' => $daysSinceFirstSend,
            'next_stage_in_days' => max(0, $limits['min_age_days'] - $daysSinceFirstSend),
            'recommendations' => $this->getWarmupRecommendations($warmupStage, $daysSinceFirstSend),
        ];
    }

    /**
     * Calculate warmup stage based on account age and sending history
     */
    private function calculateWarmupStage(int $accountId): int
    {
        $cacheKey = "account:{$accountId}:send_stats";
        $stats = Cache::get($cacheKey);

        if (!$stats || !isset($stats['first_send_at'])) {
            return 1; // New account
        }

        $daysSending = now()->diffInDays($stats['first_send_at']);

        if ($daysSending >= 14) return 4; // Established (>2 weeks)
        if ($daysSending >= 7) return 3;  // Intermediate (1-2 weeks)
        if ($daysSending >= 3) return 2;  // Early (3-7 days)
        return 1; // New (<3 days)
    }

    /**
     * Get rate limits based on warmup stage
     */
    private function getWarmupLimits(int $stage): array
    {
        $limits = [
            1 => ['daily_limit' => 100, 'hourly_limit' => 20, 'min_delay_seconds' => 5, 'min_age_days' => 3],
            2 => ['daily_limit' => 300, 'hourly_limit' => 50, 'min_delay_seconds' => 3, 'min_age_days' => 7],
            3 => ['daily_limit' => 1000, 'hourly_limit' => 100, 'min_delay_seconds' => 2, 'min_age_days' => 14],
            4 => ['daily_limit' => 5000, 'hourly_limit' => 500, 'min_delay_seconds' => 1, 'min_age_days' => 99999],
        ];

        return $limits[$stage] ?? $limits[4];
    }

    /**
     * Get human-readable stage description
     */
    private function getStageDescription(int $stage): string
    {
        return match($stage) {
            1 => '🔴 New Account - Limited sending',
            2 => '🟡 Early Stage - Building reputation',
            3 => '🟠 Intermediate - Improving reputation',
            4 => '🟢 Established - Full capacity',
            default => 'Unknown',
        };
    }

    /**
     * Get warmup recommendations
     */
    private function getWarmupRecommendations(int $stage, int $daysSending): array
    {
        $recommendations = [];

        if ($stage === 1) {
            $recommendations[] = 'Start with small batches (20-50 emails/hour)';
            $recommendations[] = 'Monitor bounce rates closely';
            $recommendations[] = 'Remove bounces immediately';
            $recommendations[] = 'Wait 3+ days before increasing volume';
        } elseif ($stage === 2) {
            $recommendations[] = 'Gradually increase email volume';
            $recommendations[] = 'Keep bounce rate below 2%';
            $recommendations[] = 'Ensure good engagement (opens/clicks)';
            $recommendations[] = 'Continue for 7+ days before ramping up';
        } elseif ($stage === 3) {
            $recommendations[] = 'You can increase volume more aggressively';
            $recommendations[] = 'Monitor complaint rates (target: <0.1%)';
            $recommendations[] = 'Maintain engagement with quality content';
            $recommendations[] = 'Continue current sending pattern for 7+ more days';
        } else {
            $recommendations[] = 'Maintain current reputation with quality sends';
            $recommendations[] = 'Keep bounce rate below 2%';
            $recommendations[] = 'Keep complaint rate below 0.1%';
            $recommendations[] = 'Monitor engagement metrics';
        }

        return $recommendations;
    }

    /**
     * Get server IP address
     */
    private function getServerIP(): string
    {
        if (!empty($_SERVER['SERVER_ADDR'])) {
            return $_SERVER['SERVER_ADDR'];
        }
        if (!empty($_SERVER['LOCAL_ADDR'])) {
            return $_SERVER['LOCAL_ADDR'];
        }
        return gethostbyname(gethostname()) ?? '127.0.0.1';
    }
}
