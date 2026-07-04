<?php

namespace App\Services;

use App\Models\ConnectedAccount;
use Illuminate\Support\Facades\Log;

class IPDetectionService
{
    /**
     * Detect IP for OAuth account (Microsoft)
     * Microsoft doesnt expose exact IP directly, so we track from headers
     */
    public function getOAuthAccountIP(ConnectedAccount $account): string
    {
        // If we have a cached IP, return it
        if ($account->ip_address) {
            return $account->ip_address;
        }

        // Microsoft endpoints handle routing, so we use a placeholder
        // In production, parse X-Originating-IP headers from received emails
        return "Microsoft-OAuth-IP-{$account->id}";
    }

    /**
     * Detect IP for SMTP account
     */
    public function getSMTPAccountIP(ConnectedAccount $account): string
    {
        // If already cached, return it
        if ($account->ip_address) {
            return $account->ip_address;
        }

        // Parse SMTP credentials to get server IP
        try {
            $credentials = json_decode(decrypt($account->smtp_credentials), true);
            $host = $credentials['host'] ?? null;

            if (!$host) {
                return 'unknown-smtp';
            }

            // Resolve hostname to IP
            $ip = gethostbyname($host);

            // Update account with detected IP
            if ($ip !== $host) {  // gethostbyname returns the hostname if resolution fails
                $account->update(['ip_address' => $ip]);
                Log::info("Detected SMTP IP for account {$account->id}: {$ip}");
                return $ip;
            }

            return "unknown-smtp-{$host}";
        } catch (\Exception $e) {
            Log::warning("Failed to detect SMTP IP for account {$account->id}: {$e->getMessage()}");
            return 'unknown-smtp-error';
        }
    }

    /**
     * Get IP for any account type
     */
    public function getAccountIP(ConnectedAccount $account): string
    {
        return match ($account->connection_type) {
            'oauth' => $this->getOAuthAccountIP($account),
            'oauth_manual' => $this->getOAuthAccountIP($account),
            'smtp' => $this->getSMTPAccountIP($account),
            default => 'unknown-ip',
        };
    }
}
