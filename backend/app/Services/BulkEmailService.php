<?php

namespace App\Services;

use App\Models\BulkEmailCampaign;
use App\Models\ConnectedAccount;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class BulkEmailService
{
    public function __construct(
        private EmailQueueService $queueService,
        private ReplyToResolver $replyToResolver,
        private AccountSelectorService $accountSelector,
        private SmartRateLimiter $rateLimiter,
    ) {}

    /**
     * Create a new bulk email campaign
     */
    public function createCampaign(User $user, array $data): BulkEmailCampaign
    {
        // Validate input
        $this->validateCampaignData($data);

        // Verify accounts exist and belong to user
        $accountIds = $data['account_ids'] ?? [];
        $this->verifyAccounts($user, $accountIds);

        // Validate reply-to config if provided
        if (isset($data['reply_to_config'])) {
            $errors = $this->replyToResolver->validateConfig($data['reply_to_config']);
            if (!empty($errors)) {
                throw ValidationException::withMessages(['reply_to_config' => $errors]);
            }
        }

        // Create campaign
        $campaign = BulkEmailCampaign::create([
            'user_id' => $user->id,
            'name' => $data['name'],
            'subject' => $data['subject'],
            'body' => $data['body'],
            'html_body' => $data['html_body'] ?? null,
            'config' => $data['config'] ?? [],
            'reply_to_config' => $data['reply_to_config'] ?? [],
            'importance_high' => $data['importance_high'] ?? false,
            'account_ids' => $accountIds,
            'ip_rotation_strategy' => $data['ip_rotation_strategy'] ?? 'reputation-based',
            'ip_daily_limit' => $data['ip_daily_limit'] ?? 500,
            'ip_hourly_limit' => $data['ip_hourly_limit'] ?? 50,
            'ip_warmup_enabled' => $data['ip_warmup_enabled'] ?? true,
            'status' => $data['status'] ?? 'draft',
            'recipient_distribution' => $data['recipient_distribution'] ?? 'round-robin',
            'account_config' => $data['account_config'] ?? [],
        ]);

        Log::info("Campaign created: {$campaign->id} by user {$user->id}");

        return $campaign;
    }

    /**
     * Add recipients to campaign
     */
    public function addRecipients(BulkEmailCampaign $campaign, array $recipients): int
    {
        return $this->queueService->generateQueue($campaign, $recipients);
    }

    /**
     * Start sending campaign
     */
    public function startCampaign(BulkEmailCampaign $campaign): BulkEmailCampaign
    {
        if ($campaign->status !== 'draft' && $campaign->status !== 'paused') {
            throw new \Exception("Cannot start campaign with status: {$campaign->status}");
        }

        $campaign->update([
            'status' => 'running',
            'started_at' => now(),
            'paused_at' => null,
        ]);

        Log::info("Campaign started: {$campaign->id}");

        return $campaign;
    }

    /**
     * Pause campaign
     */
    public function pauseCampaign(BulkEmailCampaign $campaign): BulkEmailCampaign
    {
        $campaign->update([
            'status' => 'paused',
            'paused_at' => now(),
        ]);

        Log::info("Campaign paused: {$campaign->id}");

        return $campaign;
    }

    /**
     * Resume campaign
     */
    public function resumeCampaign(BulkEmailCampaign $campaign): BulkEmailCampaign
    {
        if ($campaign->status !== 'paused') {
            throw new \Exception("Cannot resume campaign with status: {$campaign->status}");
        }

        $campaign->update([
            'status' => 'running',
            'paused_at' => null,
        ]);

        Log::info("Campaign resumed: {$campaign->id}");

        return $campaign;
    }

    /**
     * Cancel campaign
     */
    public function cancelCampaign(BulkEmailCampaign $campaign): BulkEmailCampaign
    {
        $campaign->update(['status' => 'failed']);

        Log::info("Campaign cancelled: {$campaign->id}");

        return $campaign;
    }

    /**
     * Get campaign statistics
     */
    public function getStats(BulkEmailCampaign $campaign): array
    {
        $stats = $this->queueService->getStats($campaign);

        return array_merge($stats, [
            'progress' => $campaign->progress_percent,
            'bounce_rate' => $campaign->bounce_rate,
            'complaint_rate' => $campaign->complaint_rate,
            'status' => $campaign->status,
        ]);
    }

    /**
     * Validate campaign data
     */
    private function validateCampaignData(array $data): void
    {
        if (empty($data['name'])) {
            throw ValidationException::withMessages(['name' => 'Campaign name is required']);
        }

        if (empty($data['subject'])) {
            throw ValidationException::withMessages(['subject' => 'Email subject is required']);
        }

        if (empty($data['body']) && empty($data['html_body'])) {
            throw ValidationException::withMessages(['body' => 'Email body is required']);
        }
    }

    /**
     * Verify accounts exist and belong to user
     */
    private function verifyAccounts(User $user, array $accountIds): void
    {
        if (empty($accountIds)) {
            throw ValidationException::withMessages(['account_ids' => 'At least one account is required']);
        }

        $accountCount = ConnectedAccount::whereIn('id', $accountIds)
            ->where('user_id', $user->id)
            ->count();

        if ($accountCount !== count($accountIds)) {
            throw ValidationException::withMessages(['account_ids' => 'One or more accounts do not exist or do not belong to you']);
        }
    }
}
