<?php

namespace App\Services;

use App\Models\BulkEmailCampaign;
use App\Models\BulkEmailQueueItem;
use App\Models\ConnectedAccount;
use Illuminate\Support\Facades\Log;

class QueueWorkerService
{
    public function __construct(
        private EmailSenderService $emailSender,
        private EmailQueueService $queueService,
        private AccountSelectorService $accountSelector,
        private SmartRateLimiter $rateLimiter,
        private IPReputationService $ipReputation,
    ) {}

    /**
     * Process pending emails for a campaign
     */
    public function processCampaignQueue(BulkEmailCampaign $campaign, int $batchSize = 50): array
    {
        if ($campaign->status !== 'running') {
            Log::warning("Campaign {$campaign->id} is not running");
            return ['processed' => 0, 'failed' => 0];
        }

        $stats = ['processed' => 0, 'failed' => 0, 'paused' => false];

        // Get pending items
        $pending = BulkEmailQueueItem::where('campaign_id', $campaign->id)
            ->where('status', 'pending')
            ->orderBy('created_at')
            ->take($batchSize)
            ->get();

        foreach ($pending as $item) {
            try {
                // Check safety thresholds
                if ($this->shouldPauseCampaign($campaign)) {
                    $campaign->update(['status' => 'paused', 'paused_at' => now()]);
                    Log::warning("Campaign {$campaign->id} auto-paused due to safety threshold");
                    $stats['paused'] = true;
                    break;
                }

                // Select account
                $account = $this->selectAccountForEmail($campaign, $item);

                if (!$account) {
                    Log::warning("No available account for campaign {$campaign->id}");
                    $item->update(['status' => 'failed', 'error_message' => 'No available accounts']);
                    $stats['failed']++;
                    continue;
                }

                // Prepare email body with signature
                $emailBody = $campaign->html_body ?? $campaign->body;
                $config = $campaign->config ?? [];
                $includeSignature = $config['include_signature'] ?? true;

                // If signature is enabled, append it to the body
                if ($includeSignature) {
                    try {
                        $signature = null;
                        $signatureMode = $config['signature_mode'] ?? 'dynamic';

                        // For static mode, use the specified signature
                        if ($signatureMode === 'static' && !empty($config['signature_id'])) {
                            $signature = \App\Models\EmailSignature::find($config['signature_id']);
                        } else if ($signatureMode === 'dynamic') {
                            // For dynamic mode, get the account's default signature
                            $signature = $account->signatures()->wherePivot('is_default', true)->first();
                        }

                        if ($signature) {
                            $variables = [
                                'accountEmail' => $account->email,
                                'accountName' => $account->display_name,
                                'accountPhone' => $account->phone ?? '',
                                'companyName' => config('app.name', 'Company'),
                                'currentDate' => now()->format('Y-m-d'),
                            ];
                            $signatureHtml = $signature->render($variables);
                            // Append signature with proper HTML separator
                            $emailBody = $emailBody . '<hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;">' . $signatureHtml;
                            Log::info("Signature appended to campaign {$campaign->id} email to {$item->recipient_email}");
                        }
                    } catch (\Exception $e) {
                        Log::warning("Failed to append signature for campaign {$campaign->id}: {$e->getMessage()}");
                    }
                }

                // Send email
                $result = $this->emailSender->sendCampaignEmail($account, $item, [
                    'subject' => $campaign->subject,
                    'body' => $campaign->body,
                    'html_body' => $emailBody,
                    'importance_high' => $campaign->importance_high,
                    'reply_to_config' => $campaign->reply_to_config,
                ]);

                // Handle result
                if ($result['success']) {
                    $this->queueService->markSent($item, $account->id, $account->ip_address ?? 'unknown');
                    $campaign->increment('sent_count');
                    $stats['processed']++;
                } else {
                    $this->queueService->markFailed(
                        $item,
                        $result['error'] ?? 'Unknown error',
                        $result['error_code'] ?? null,
                        $this->canRetry($result['error_code'] ?? null)
                    );
                    $campaign->increment('failed_count');
                    $stats['failed']++;
                }
            } catch (\Exception $e) {
                Log::error("Error processing queue item {$item->id}: {$e->getMessage()}");
                $this->queueService->markFailed($item, $e->getMessage(), 'exception', true);
                $campaign->increment('failed_count');
                $stats['failed']++;
            }

            // Respect rate limiting
            $this->applyDelay($campaign);
        }

        // Update campaign stats
        $campaign->update([
            'sent_count' => BulkEmailQueueItem::where('campaign_id', $campaign->id)->where('status', 'sent')->count(),
            'failed_count' => BulkEmailQueueItem::where('campaign_id', $campaign->id)->where('status', 'failed')->count(),
        ]);

        return $stats;
    }

    /**
     * Process all running campaigns
     */
    public function processAllCampaigns(int $batchSize = 50): array
    {
        $campaigns = BulkEmailCampaign::where('status', 'running')
            ->orderBy('created_at')
            ->get();

        $totals = ['processed' => 0, 'failed' => 0, 'paused' => 0];

        foreach ($campaigns as $campaign) {
            $result = $this->processCampaignQueue($campaign, $batchSize);
            $totals['processed'] += $result['processed'];
            $totals['failed'] += $result['failed'];
            if ($result['paused']) $totals['paused']++;

            // Small delay between campaigns
            usleep(100000); // 100ms
        }

        return $totals;
    }

    /**
     * Process retry queue for failed emails
     */
    public function processRetryQueue(int $maxRetries = 3): array
    {
        $retryItems = BulkEmailQueueItem::where('status', 'retrying')
            ->where('retry_count', '<', $maxRetries)
            ->orderBy('last_retry_at')
            ->take(50)
            ->get();

        $stats = ['retried' => 0, 'succeeded' => 0, 'failed' => 0];

        foreach ($retryItems as $item) {
            try {
                $campaign = $item->campaign;
                $account = $this->selectAccountForEmail($campaign, $item);

                if (!$account) continue;

                // Prepare email body with signature
                $emailBody = $campaign->html_body ?? $campaign->body;
                $config = $campaign->config ?? [];
                $includeSignature = $config['include_signature'] ?? true;

                // If signature is enabled, append it to the body
                if ($includeSignature) {
                    try {
                        $signature = null;
                        $signatureMode = $config['signature_mode'] ?? 'dynamic';

                        // For static mode, use the specified signature
                        if ($signatureMode === 'static' && !empty($config['signature_id'])) {
                            $signature = \App\Models\EmailSignature::find($config['signature_id']);
                        } else if ($signatureMode === 'dynamic') {
                            // For dynamic mode, get the account's default signature
                            $signature = $account->signatures()->wherePivot('is_default', true)->first();
                        }

                        if ($signature) {
                            $variables = [
                                'accountEmail' => $account->email,
                                'accountName' => $account->display_name,
                                'accountPhone' => $account->phone ?? '',
                                'companyName' => config('app.name', 'Company'),
                                'currentDate' => now()->format('Y-m-d'),
                            ];
                            $signatureHtml = $signature->render($variables);
                            // Append signature with proper HTML separator
                            $emailBody = $emailBody . '<hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;">' . $signatureHtml;
                            Log::info("Signature appended to campaign {$campaign->id} email to {$item->recipient_email}");
                        }
                    } catch (\Exception $e) {
                        Log::warning("Failed to append signature for campaign {$campaign->id}: {$e->getMessage()}");
                    }
                }

                $result = $this->emailSender->sendCampaignEmail($account, $item, [
                    'subject' => $campaign->subject,
                    'body' => $campaign->body,
                    'html_body' => $emailBody,
                    'importance_high' => $campaign->importance_high,
                ]);

                if ($result['success']) {
                    $this->queueService->markSent($item, $account->id, $account->ip_address ?? 'unknown');
                    $stats['succeeded']++;
                } else {
                    $this->queueService->markFailed($item, $result['error'] ?? 'Retry failed');
                    $stats['failed']++;
                }

                $stats['retried']++;
            } catch (\Exception $e) {
                Log::error("Retry failed for item {$item->id}: {$e->getMessage()}");
            }
        }

        return $stats;
    }

    /**
     * Select best account for this email
     */
    private function selectAccountForEmail(
        BulkEmailCampaign $campaign,
        BulkEmailQueueItem $item
    ): ?ConnectedAccount {
        try {
            return $this->accountSelector->selectNextAccount(
                $campaign->account_ids ?? [],
                $campaign->ip_rotation_strategy,
                $campaign->ip_daily_limit
            );
        } catch (\Exception $e) {
            Log::warning("Account selection failed: {$e->getMessage()}");
            return null;
        }
    }

    /**
     * Check if campaign should be auto-paused
     */
    private function shouldPauseCampaign(BulkEmailCampaign $campaign): bool
    {
        if ($campaign->sent_count == 0) return false;

        $bounceRate = ($campaign->bounced_count / $campaign->sent_count) * 100;
        $complaintRate = ($campaign->complaint_count / $campaign->sent_count) * 100;

        // Auto-pause if bounce rate > 10%
        if ($bounceRate > 10) {
            Log::warning("Campaign {$campaign->id} hit bounce rate threshold: {$bounceRate}%");
            return true;
        }

        // Auto-pause if any complaints
        if ($complaintRate > 0) {
            Log::warning("Campaign {$campaign->id} received complaints");
            return true;
        }

        return false;
    }

    /**
     * Determine if error is retryable
     */
    private function canRetry(?string $errorCode): bool
    {
        $retryable = ['rate_limit_exceeded', 'temporary_failure', 'network_error'];
        return in_array($errorCode, $retryable);
    }

    /**
     * Apply sending delay based on campaign config
     */
    private function applyDelay(BulkEmailCampaign $campaign): void
    {
        $delaySeconds = $campaign->config['delay_between'] ?? 5;
        usleep($delaySeconds * 1000000); // Convert to microseconds
    }
}
