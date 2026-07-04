<?php

namespace App\Services;

use App\Models\BulkEmailQueueItem;
use App\Models\ConnectedAccount;
use Illuminate\Support\Facades\Log;

class DeliveryTrackerService
{
    public function __construct(
        private IPReputationService $ipReputation,
        private EmailQueueService $queueService,
    ) {}

    /**
     * Handle bounce notification
     */
    public function handleBounce(string $email, string $bounceType = 'soft', ?string $reason = null): void
    {
        $queueItem = BulkEmailQueueItem::where('recipient_email', $email)
            ->whereIn('status', ['sent', 'pending'])
            ->orderByDesc('sent_at')
            ->first();

        if (!$queueItem) {
            Log::warning("Bounce received for unknown email: {$email}");
            return;
        }

        $this->queueService->markBounced($queueItem, $bounceType);

        Log::info("Bounce recorded: {$email} ({$bounceType})");

        // Update account reputation
        if ($queueItem->assigned_account_id) {
            $account = ConnectedAccount::find($queueItem->assigned_account_id);
            if ($account) {
                $this->ipReputation->recordBounce($account, $bounceType);
            }
        }

        // Update campaign bounce count
        if ($queueItem->campaign) {
            $queueItem->campaign->increment('bounced_count');
        }
    }

    /**
     * Handle complaint notification
     */
    public function handleComplaint(string $email, ?string $reason = null): void
    {
        $queueItem = BulkEmailQueueItem::where('recipient_email', $email)
            ->whereIn('status', ['sent', 'pending'])
            ->orderByDesc('sent_at')
            ->first();

        if (!$queueItem) {
            Log::warning("Complaint received for unknown email: {$email}");
            return;
        }

        Log::warning("Complaint recorded: {$email}. Reason: {$reason}");

        // Update account reputation
        if ($queueItem->assigned_account_id) {
            $account = ConnectedAccount::find($queueItem->assigned_account_id);
            if ($account) {
                $this->ipReputation->recordComplaint($account);
            }
        }

        // Update campaign complaint count
        if ($queueItem->campaign) {
            $queueItem->campaign->increment('complaint_count');
            // Flag for review
            $campaign = $queueItem->campaign;
            Log::critical("Campaign {$campaign->id} received complaint - consider pausing");
        }
    }

    /**
     * Handle delivery success
     */
    public function handleDeliverySuccess(string $email, ?string $messageId = null): void
    {
        $queueItem = BulkEmailQueueItem::where('recipient_email', $email)
            ->where('status', 'sent')
            ->orderByDesc('sent_at')
            ->first();

        if (!$queueItem) {
            Log::info("Delivery success recorded for: {$email}");
            return;
        }

        $queueItem->update([
            'delivery_status' => 'delivered',
            'metadata' => array_merge($queueItem->metadata ?? [], ['message_id' => $messageId]),
        ]);

        Log::info("Email delivered: {$email}");
    }

    /**
     * Handle failed delivery
     */
    public function handleDeliveryFailure(string $email, string $reason, ?string $errorCode = null): void
    {
        $queueItem = BulkEmailQueueItem::where('recipient_email', $email)
            ->whereIn('status', ['sent', 'pending'])
            ->orderByDesc('sent_at')
            ->first();

        if (!$queueItem) {
            Log::warning("Delivery failure for unknown email: {$email}");
            return;
        }

        // Determine if it's a bounce or just delivery failure
        $isBounce = stripos($reason, 'bounce') !== false || 
                   stripos($reason, 'invalid') !== false ||
                   stripos($reason, 'does not exist') !== false;

        if ($isBounce) {
            $this->handleBounce($email, 'hard', $reason);
        } else {
            $this->queueService->markFailed($queueItem, $reason, $errorCode, true);
            if ($queueItem->campaign) {
                $queueItem->campaign->increment('failed_count');
            }
        }

        Log::warning("Delivery failed for {$email}: {$reason}");
    }

    /**
     * Parse Microsoft Graph delivery notification
     */
    public function parseGraphNotification(array $notification): void
    {
        try {
            $changeType = $notification['changeType'] ?? null;
            $resourceData = $notification['resourceData'] ?? [];

            if ($changeType === 'updated') {
                $this->handleGraphMessageUpdate($resourceData);
            }
        } catch (\Exception $e) {
            Log::error("Failed to parse Graph notification: {$e->getMessage()}");
        }
    }

    /**
     * Handle Graph API message update
     */
    private function handleGraphMessageUpdate(array $messageData): void
    {
        $messageId = $messageData['id'] ?? null;
        if (!$messageId) return;

        // Find queue item by message ID
        $queueItem = BulkEmailQueueItem::where('metadata->message_id', $messageId)
            ->first();

        if (!$queueItem) return;

        // Check if message has delivery notification
        $hasDeliveryNotification = isset($messageData['isDraft']) && !$messageData['isDraft'];
        if ($hasDeliveryNotification) {
            $this->handleDeliverySuccess($queueItem->recipient_email, $messageId);
        }
    }

    /**
     * Record hard/soft bounce patterns
     */
    public function analyzeBouncePattern(ConnectedAccount $account): array
    {
        $bounces = BulkEmailQueueItem::where('assigned_account_id', $account->id)
            ->where('status', 'bounced')
            ->whereDate('created_at', today())
            ->get();

        $hardBounces = $bounces->filter(fn($b) => $b->bounce_type === 'hard')->count();
        $softBounces = $bounces->filter(fn($b) => $b->bounce_type === 'soft')->count();

        return [
            'total_bounces' => $bounces->count(),
            'hard_bounces' => $hardBounces,
            'soft_bounces' => $softBounces,
            'bounce_rate' => $bounces->count() > 0 
                ? ($hardBounces / $bounces->count()) * 100 
                : 0,
        ];
    }
}
