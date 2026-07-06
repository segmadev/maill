<?php

namespace App\Services;

use App\Models\ConnectedAccount;
use App\Models\BulkEmailQueueItem;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;

class EmailSenderService
{
    public function __construct(
        private IPDetectionService $ipDetection,
        private SmartRateLimiter $rateLimiter,
        private ReplyToResolver $replyToResolver,
    ) {}

    /**
     * Send email via OAuth2 account (Microsoft Graph)
     */
    public function sendViaOAuth(
        ConnectedAccount $account,
        BulkEmailQueueItem $queueItem,
        array $emailData
    ): array {
        try {
            // Refresh token if needed
            $this->ensureTokenValid($account);

            // Build message
            $message = $this->buildGraphMessage($emailData, $queueItem);

            // Send via Microsoft Graph API
            $response = Http::withToken($account->oauth_access_token)
                ->post('https://graph.microsoft.com/v1.0/me/sendMail', [
                    'message' => $message,
                ])
                ->throw();

            Log::info("Email sent via OAuth to {$queueItem->recipient_email} from {$account->email}");

            return [
                'success' => true,
                'message_id' => $response->json('value') ?? null,
                'sent_at' => now(),
            ];
        } catch (\Exception $e) {
            Log::error("OAuth send failed for {$queueItem->recipient_email}: {$e->getMessage()}");
            return [
                'success' => false,
                'error' => $e->getMessage(),
                'error_code' => 'oauth_send_failed',
            ];
        }
    }

    /**
     * Send email via SMTP account
     */
    public function sendViaSMTP(
        ConnectedAccount $account,
        BulkEmailQueueItem $queueItem,
        array $emailData
    ): array {
        try {
            $credentials = json_decode(decrypt($account->smtp_credentials), true);

            // Use Laravel Mail with SMTP config
            // In production, you'd configure dynamic SMTP here
            $message = \Mail::mailable(
                new \Illuminate\Mail\Mailable()
            );

            // Set transport dynamically
            config([
                'mail.mailers.smtp.host' => $credentials['host'],
                'mail.mailers.smtp.port' => $credentials['port'],
                'mail.mailers.smtp.username' => $credentials['username'],
                'mail.mailers.smtp.password' => decrypt($credentials['password']),
            ]);

            // Build and send
            \Mail::mailer('smtp')
                ->to($queueItem->recipient_email, $queueItem->recipient_name)
                ->from($account->email, $account->display_name)
                ->replyTo($emailData['reply_to'])
                ->subject($emailData['subject'])
                ->html($emailData['html_body'] ?? $emailData['body'])
                ->send();

            Log::info("Email sent via SMTP to {$queueItem->recipient_email} from {$account->email}");

            return [
                'success' => true,
                'sent_at' => now(),
            ];
        } catch (\Exception $e) {
            Log::error("SMTP send failed for {$queueItem->recipient_email}: {$e->getMessage()}");
            return [
                'success' => false,
                'error' => $e->getMessage(),
                'error_code' => 'smtp_send_failed',
            ];
        }
    }

    /**
     * Send email from campaign
     */
    public function sendCampaignEmail(
        ConnectedAccount $account,
        BulkEmailQueueItem $queueItem,
        array $campaignData
    ): array {
        // Check rate limits
        if (!$this->rateLimiter->canSendFromAccount($account)) {
            return [
                'success' => false,
                'error' => 'Rate limit exceeded',
                'error_code' => 'rate_limit_exceeded',
            ];
        }

        // Resolve reply-to address
        $replyTo = $this->replyToResolver->resolve(
            $queueItem->campaign,
            $queueItem->recipient_email,
            $queueItem->recipient_group
        );

        // Prepare email data
        $emailData = [
            'to' => $queueItem->recipient_email,
            'to_name' => $queueItem->recipient_name,
            'subject' => $campaignData['subject'],
            'body' => $campaignData['body'],
            'html_body' => $campaignData['html_body'] ?? null,
            'reply_to' => $replyTo,
            'importance_high' => $campaignData['importance_high'] ?? false,
            'from' => $account->email,
            'from_name' => $account->display_name,
        ];

        // Send via appropriate method
        $result = match ($account->connection_type) {
            'oauth', 'oauth_manual' => $this->sendViaOAuth($account, $queueItem, $emailData),
            'smtp' => $this->sendViaSMTP($account, $queueItem, $emailData),
            default => ['success' => false, 'error' => 'Unknown connection type'],
        };

        // Record stats
        if ($result['success']) {
            $this->rateLimiter->recordSend($account);
            $account->increment('emails_sent');
        }

        return $result;
    }

    /**
     * Build Microsoft Graph message format
     */
    private function buildGraphMessage(array $emailData, BulkEmailQueueItem $queueItem): array
    {
        return [
            'subject' => $emailData['subject'],
            'body' => [
                'contentType' => empty($emailData['html_body']) ? 'text' : 'html',
                'content' => $emailData['html_body'] ?? $emailData['body'],
            ],
            'toRecipients' => [
                [
                    'emailAddress' => [
                        'address' => $emailData['to'],
                        'name' => $emailData['to_name'],
                    ],
                ],
            ],
            'replyToAddresses' => [
                ['emailAddress' => ['address' => $emailData['reply_to']]],
            ],
            'from' => [
                'emailAddress' => [
                    'address' => $emailData['from'],
                    'name' => $emailData['from_name'],
                ],
            ],
            'importance' => $emailData['importance_high'] ? 'high' : 'normal',
            'isReminderOn' => false,
        ];
    }

    /**
     * Ensure OAuth token is valid and refresh if needed
     */
    private function ensureTokenValid(ConnectedAccount $account): void
    {
        if (!$account->oauth_access_token) {
            throw new \Exception('No OAuth token available');
        }

        if ($account->token_expires_at && $account->token_expires_at->isPast()) {
            $this->refreshToken($account);
        }
    }

    /**
     * Refresh OAuth token
     */
    private function refreshToken(ConnectedAccount $account): void
    {
        try {
            $response = Http::post('https://login.microsoftonline.com/common/oauth2/v2.0/token', [
                'client_id' => $account->oauth_client_id,
                'client_secret' => decrypt($account->oauth_client_secret),
                'refresh_token' => $account->refresh_token,
                'grant_type' => 'refresh_token',
                'scope' => 'Mail.Send offline_access',
            ]);

            $data = $response->json();
            $account->update([
                'oauth_access_token' => $data['access_token'],
                'token_expires_at' => now()->addSeconds($data['expires_in'] - 300),
            ]);
        } catch (\Exception $e) {
            Log::error("Token refresh failed for account {$account->id}: {$e->getMessage()}");

            // Check if it's an invalid_grant error (expired refresh token)
            if (str_contains($e->getMessage(), 'invalid_grant')) {
                throw new \Exception("account_needs_reauth: Account {$account->id} requires re-authentication. Please reconnect this account in the Accounts page.");
            }

            throw new \Exception('Token refresh failed. Please try again or reconnect the account.');
        }
    }
}
