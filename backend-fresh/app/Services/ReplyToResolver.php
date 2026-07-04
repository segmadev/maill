<?php

namespace App\Services;

use App\Models\BulkEmailCampaign;
use App\Models\ConnectedAccount;

class ReplyToResolver
{
    /**
     * Resolve reply-to address based on hierarchy:
     * 1. Individual email override
     * 2. Group/Batch override
     * 3. Default reply-to
     * 4. Use sender account email
     */
    public function resolve(
        BulkEmailCampaign $campaign,
        string $recipientEmail,
        ?string $recipientGroup = null
    ): string {
        $config = $campaign->reply_to_config ?? [];

        // Priority 1: Individual override
        if (isset($config['individual_overrides'][$recipientEmail])) {
            return $config['individual_overrides'][$recipientEmail];
        }

        // Priority 2: Group override
        if ($recipientGroup && isset($config['batch_overrides'][$recipientGroup])) {
            return $config['batch_overrides'][$recipientGroup];
        }

        // Priority 3: Default reply-to
        if (!empty($config['default'])) {
            return $config['default'];
        }

        // Priority 4: Use sender account email (if enabled)
        if ($config['use_sender_email'] ?? false) {
            $accountId = $campaign->account_ids[0] ?? null;
            if ($accountId) {
                $account = ConnectedAccount::find($accountId);
                if ($account) {
                    return $account->email;
                }
            }
        }

        // Fallback: noreply
        return 'noreply@' . parse_url(config('app.url'), PHP_URL_HOST);
    }

    /**
     * Validate reply-to config structure
     */
    public function validateConfig(array $config): array
    {
        $errors = [];

        if (isset($config['default']) && !filter_var($config['default'], FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Default reply-to must be a valid email';
        }

        if (isset($config['individual_overrides']) && is_array($config['individual_overrides'])) {
            foreach ($config['individual_overrides'] as $email => $replyTo) {
                if (!filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
                    $errors[] = "Individual override for $email is not a valid email";
                }
            }
        }

        if (isset($config['batch_overrides']) && is_array($config['batch_overrides'])) {
            foreach ($config['batch_overrides'] as $group => $replyTo) {
                if (!filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
                    $errors[] = "Batch override for group '$group' is not a valid email";
                }
            }
        }

        return $errors;
    }
}
