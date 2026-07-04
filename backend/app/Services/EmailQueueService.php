<?php

namespace App\Services;

use App\Models\BulkEmailCampaign;
use App\Models\BulkEmailQueueItem;
use Illuminate\Support\Facades\Log;

class EmailQueueService
{
    /**
     * Generate queue items from recipients
     */
    public function generateQueue(BulkEmailCampaign $campaign, array $recipients): int
    {
        $count = 0;

        foreach ($recipients as $recipient) {
            $email = is_array($recipient) ? $recipient['email'] : $recipient;
            $name = is_array($recipient) ? ($recipient['name'] ?? null) : null;
            $group = is_array($recipient) ? ($recipient['group'] ?? null) : null;

            // Skip if already in queue
            if (
                BulkEmailQueueItem::where('campaign_id', $campaign->id)
                    ->where('recipient_email', $email)
                    ->exists()
            ) {
                continue;
            }

            BulkEmailQueueItem::create([
                'campaign_id' => $campaign->id,
                'recipient_email' => $email,
                'recipient_name' => $name,
                'recipient_group' => $group,
                'status' => 'pending',
            ]);

            $count++;
        }

        // Update campaign recipient count
        $campaign->update(['recipient_count' => BulkEmailQueueItem::where('campaign_id', $campaign->id)->count()]);

        Log::info("Generated {$count} queue items for campaign {$campaign->id}");

        return $count;
    }

    /**
     * Get next pending item to send
     */
    public function getNextPending(BulkEmailCampaign $campaign): ?BulkEmailQueueItem
    {
        return BulkEmailQueueItem::where('campaign_id', $campaign->id)
            ->where('status', 'pending')
            ->orderBy('created_at')
            ->first();
    }

    /**
     * Mark item as sent
     */
    public function markSent(BulkEmailQueueItem $item, string $accountId, string $accountIp): void
    {
        $item->update([
            'status' => 'sent',
            'assigned_account_id' => $accountId,
            'assigned_account_ip' => $accountIp,
            'sent_at' => now(),
            'delivery_status' => 'sent',
        ]);
    }

    /**
     * Mark item as failed
     */
    public function markFailed(
        BulkEmailQueueItem $item,
        string $errorMessage,
        ?string $errorCode = null,
        bool $canRetry = true
    ): void {
        $item->update([
            'status' => $canRetry ? 'retrying' : 'failed',
            'error_message' => $errorMessage,
            'error_code' => $errorCode,
            'retry_count' => $item->retry_count + 1,
            'last_retry_at' => now(),
        ]);
    }

    /**
     * Mark item as bounced
     */
    public function markBounced(
        BulkEmailQueueItem $item,
        string $bounceType = 'soft'
    ): void {
        $item->update([
            'status' => 'bounced',
            'bounce_type' => $bounceType,
            'delivery_status' => 'bounced',
        ]);
    }

    /**
     * Get queue stats for campaign
     */
    public function getStats(BulkEmailCampaign $campaign): array
    {
        return [
            'pending' => BulkEmailQueueItem::where('campaign_id', $campaign->id)->where('status', 'pending')->count(),
            'sent' => BulkEmailQueueItem::where('campaign_id', $campaign->id)->where('status', 'sent')->count(),
            'failed' => BulkEmailQueueItem::where('campaign_id', $campaign->id)->where('status', 'failed')->count(),
            'bounced' => BulkEmailQueueItem::where('campaign_id', $campaign->id)->where('status', 'bounced')->count(),
            'retrying' => BulkEmailQueueItem::where('campaign_id', $campaign->id)->where('status', 'retrying')->count(),
        ];
    }

    /**
     * Get retry candidates (failed items that can be retried)
     */
    public function getRetryItems(BulkEmailCampaign $campaign, int $maxRetries = 3): \Illuminate\Database\Eloquent\Collection
    {
        return BulkEmailQueueItem::where('campaign_id', $campaign->id)
            ->whereIn('status', ['retrying', 'failed'])
            ->where('retry_count', '<', $maxRetries)
            ->orderBy('last_retry_at')
            ->take(100)
            ->get();
    }
}
