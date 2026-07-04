<?php

namespace App\Services;

use App\Models\ConnectedAccount;
use App\Models\IPSendStats;
use Illuminate\Support\Collection;

class AccountSelectorService
{
    /**
     * Select next account based on strategy
     */
    public function selectNextAccount(
        array $accountIds,
        string $strategy = 'reputation-based',
        ?int $dailyLimit = 500
    ): ?ConnectedAccount {
        $today = today();

        // Get valid accounts
        $accounts = ConnectedAccount::whereIn('id', $accountIds)
            ->where('is_ip_blacklisted', false)
            ->get();

        if ($accounts->isEmpty()) {
            throw new \Exception('No valid accounts available - all IPs may be blacklisted');
        }

        // Filter out exhausted accounts
        $availableAccounts = $accounts->filter(function ($account) use ($today, $dailyLimit) {
            // Skip if reputation too low
            if ($account->ip_reputation_score < 30) {
                return false;
            }

            // Check daily limit
            $stats = IPSendStats::where('account_id', $account->id)
                ->where('date', $today)
                ->first();

            if ($stats && $stats->emails_sent >= ($dailyLimit ?? 500)) {
                return false;
            }

            return true;
        });

        if ($availableAccounts->isEmpty()) {
            throw new \Exception('No available accounts - daily limits exceeded or all IPs have low reputation');
        }

        // Select based on strategy
        return match ($strategy) {
            'round-robin' => $this->selectRoundRobin($availableAccounts),
            'load-based' => $this->selectLeastUsed($availableAccounts, $today),
            'reputation-based' => $this->selectByReputation($availableAccounts, $today),
            default => $availableAccounts->first(),
        };
    }

    private function selectRoundRobin(Collection $accounts): ConnectedAccount
    {
        // Simple round-robin: use cache or return first
        // In production, use Redis to track round-robin index
        return $accounts->first();
    }

    private function selectLeastUsed(Collection $accounts, $date): ConnectedAccount
    {
        return $accounts
            ->map(function ($account) use ($date) {
                $stats = IPSendStats::where('account_id', $account->id)
                    ->where('date', $date)
                    ->first();

                return (object) [
                    'account' => $account,
                    'sent_today' => $stats->emails_sent ?? 0,
                ];
            })
            ->sortBy('sent_today')
            ->first()
            ->account;
    }

    private function selectByReputation(Collection $accounts, $date): ConnectedAccount
    {
        return $accounts
            ->map(function ($account) use ($date) {
                $stats = IPSendStats::where('account_id', $account->id)
                    ->where('date', $date)
                    ->first();

                return (object) [
                    'account' => $account,
                    'reputation_score' => $stats->reputation_score ?? 100,
                    'sent_today' => $stats->emails_sent ?? 0,
                ];
            })
            ->sortByDesc('reputation_score')
            ->sortBy('sent_today')  // Then by load
            ->first()
            ->account;
    }
}
