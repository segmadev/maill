<?php

namespace App\Services;

/**
 * Allocation Strategy Service
 *
 * Distributes recipients among selected accounts based on strategy
 */
class AllocationStrategyService
{
    /**
     * Allocate recipients to accounts based on strategy
     *
     * @param array $recipients Array of {email, data}
     * @param array $accountIds Selected account IDs
     * @param string $strategy 'round-robin' or 'equal'
     * @return array Array of {email, account_id, status: 'pending', reason: null}
     */
    public function allocate(array $recipients, array $accountIds, string $strategy = 'round-robin'): array
    {
        if (empty($accountIds) || empty($recipients)) {
            return [];
        }

        $allocation = [];

        if ($strategy === 'round-robin') {
            // Distribute recipients in round-robin fashion
            foreach ($recipients as $index => $recipient) {
                $accountIndex = $index % count($accountIds);
                $allocation[] = [
                    'email' => $recipient['email'],
                    'account_id' => $accountIds[$accountIndex],
                    'status' => 'pending',
                    'reason' => null,
                ];
            }
        } else {
            // Equal split: divide recipients equally among accounts
            $emailsPerAccount = ceil(count($recipients) / count($accountIds));
            $accountIndex = 0;
            $emailCount = 0;

            foreach ($recipients as $recipient) {
                $allocation[] = [
                    'email' => $recipient['email'],
                    'account_id' => $accountIds[$accountIndex],
                    'status' => 'pending',
                    'reason' => null,
                ];

                $emailCount++;

                // Move to next account after reaching limit
                if ($emailCount >= $emailsPerAccount && $accountIndex < count($accountIds) - 1) {
                    $accountIndex++;
                    $emailCount = 0;
                }
            }
        }

        return $allocation;
    }

    /**
     * Group recipients by account
     */
    public function groupByAccount(array $tracking): array
    {
        $grouped = [];

        foreach ($tracking as $recipient) {
            $accountId = $recipient['account_id'];

            if (!isset($grouped[$accountId])) {
                $grouped[$accountId] = [];
            }

            $grouped[$accountId][] = $recipient;
        }

        return $grouped;
    }

    /**
     * Get statistics for a group of recipients
     */
    public function getStats(array $recipients): array
    {
        $total = count($recipients);
        $sent = count(array_filter($recipients, fn($r) => $r['status'] === 'sent'));
        $failed = count(array_filter($recipients, fn($r) => $r['status'] === 'failed'));
        $pending = count(array_filter($recipients, fn($r) => $r['status'] === 'pending'));

        return [
            'total' => $total,
            'sent' => $sent,
            'failed' => $failed,
            'pending' => $pending,
            'success_rate' => $total > 0 ? round(($sent / $total) * 100, 1) : 0,
        ];
    }
}
