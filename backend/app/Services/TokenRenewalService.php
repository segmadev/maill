<?php

namespace App\Services;

use App\Models\ConnectedAccount;
use App\Models\SystemStatus;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;

class TokenRenewalService
{
    private const BATCH_SIZE = 50;
    private const STATUS_KEY = 'token_renewal_progress';

    // Renews ALL OAuth tokens regardless of expiry time
    // Continuously cycles through all accounts: 1-50, 51-100, 101-150, ... then back to 1-50

    public function renewTokensBatch(): array
    {
        try {
            // Get or initialize renewal status
            $status = $this->getRenewalStatus();

            // If renewal is complete, reset for next cycle
            if ($status['is_complete']) {
                $this->resetRenewalStatus();
                $status = $this->getRenewalStatus();
                Log::info('Token renewal cycle complete, starting new cycle');
            }

            // Get next batch of accounts that need renewal
            $batch = $this->getNextBatch($status['last_account_id'] ?? 0);

            if (empty($batch)) {
                // No more accounts to renew in this cycle
                $this->markRenewalComplete();
                return [
                    'success' => true,
                    'message' => 'Token renewal cycle complete',
                    'renewed_count' => 0,
                    'total_processed' => $status['total_processed'] ?? 0,
                    'cycle_complete' => true,
                ];
            }

            // Renew tokens in this batch
            $renewalResults = $this->renewAccountTokens($batch);

            // Update progress
            $lastAccountId = end($batch)->id;
            $totalProcessed = ($status['total_processed'] ?? 0) + count($renewalResults['renewed']);

            $this->updateRenewalProgress([
                'last_account_id' => $lastAccountId,
                'total_processed' => $totalProcessed,
                'renewed_count' => $renewalResults['renewed_count'],
                'failed_count' => $renewalResults['failed_count'],
                'is_complete' => false,
            ]);

            Log::info("Token renewal batch processed: {$renewalResults['renewed_count']} renewed, {$renewalResults['failed_count']} failed");

            return [
                'success' => true,
                'message' => 'Batch renewal completed',
                'renewed_count' => $renewalResults['renewed_count'],
                'failed_count' => $renewalResults['failed_count'],
                'total_processed' => $totalProcessed,
                'batch_size' => count($batch),
                'cycle_complete' => false,
            ];
        } catch (\Exception $e) {
            Log::error('Token renewal batch failed: ' . $e->getMessage());
            return [
                'success' => false,
                'error' => $e->getMessage(),
                'message' => 'Token renewal batch failed',
            ];
        }
    }

    /**
     * Get next batch of accounts for token renewal
     * Renews ALL OAuth accounts regardless of token expiry time
     * Cycles through all accounts continuously
     */
    private function getNextBatch(int $lastAccountId = 0): array
    {
        return ConnectedAccount::query()
            ->where('id', '>', $lastAccountId)
            ->where('connection_type', 'oauth')
            ->whereNotNull('refresh_token')
            ->orderBy('id')
            ->take(self::BATCH_SIZE)
            ->get()
            ->toArray();
    }

    /**
     * Renew tokens for a batch of accounts
     */
    private function renewAccountTokens(array $batch): array
    {
        $renewed = [];
        $failed = [];

        foreach ($batch as $account) {
            try {
                if ($this->renewAccountToken($account)) {
                    $renewed[] = $account->id;
                } else {
                    $failed[] = [
                        'account_id' => $account->id,
                        'email' => $account->email,
                        'reason' => 'Refresh token invalid or expired',
                    ];
                }
            } catch (\Exception $e) {
                Log::warning("Failed to renew token for account {$account->id}: {$e->getMessage()}");
                $failed[] = [
                    'account_id' => $account->id,
                    'email' => $account->email,
                    'reason' => $e->getMessage(),
                ];
            }
        }

        return [
            'renewed' => $renewed,
            'failed' => $failed,
            'renewed_count' => count($renewed),
            'failed_count' => count($failed),
        ];
    }

    /**
     * Renew token for a single account
     */
    private function renewAccountToken(ConnectedAccount $account): bool
    {
        // Skip if no refresh token
        if (!$account->refresh_token) {
            return false;
        }

        try {
            $response = Http::post('https://login.microsoftonline.com/common/oauth2/v2.0/token', [
                'client_id' => $account->oauth_client_id,
                'client_secret' => decrypt($account->oauth_client_secret),
                'refresh_token' => $account->refresh_token,
                'grant_type' => 'refresh_token',
                'scope' => 'Mail.Send offline_access',
            ])->throw();

            $data = $response->json();

            // Update token
            $account->update([
                'access_token' => encrypt($data['access_token']),
                'token_expires_at' => now()->addSeconds($data['expires_in'] - 300),
                'refresh_token' => $data['refresh_token'] ?? $account->refresh_token,
                'last_token_refresh_at' => now(),
            ]);

            Log::info("Token renewed for account {$account->id} ({$account->email})");
            return true;
        } catch (\Exception $e) {
            Log::warning("Token refresh failed for account {$account->id}: {$e->getMessage()}");

            // Check if it's an invalid_grant error (refresh token expired)
            if (str_contains($e->getMessage(), 'invalid_grant')) {
                $account->update([
                    'requires_reauthentication' => true,
                    'last_token_refresh_at' => now(),
                ]);
                Log::warning("Account {$account->id} requires re-authentication");
            }

            return false;
        }
    }

    /**
     * Get current renewal progress status
     */
    private function getRenewalStatus(): array
    {
        $status = SystemStatus::where('key', self::STATUS_KEY)->first();

        if (!$status) {
            return [
                'last_account_id' => 0,
                'total_processed' => 0,
                'renewed_count' => 0,
                'failed_count' => 0,
                'is_complete' => true,
                'started_at' => null,
            ];
        }

        return $status->value ?? [];
    }

    /**
     * Update renewal progress
     */
    private function updateRenewalProgress(array $data): void
    {
        SystemStatus::updateOrCreate(
            ['key' => self::STATUS_KEY],
            ['value' => $data]
        );
    }

    /**
     * Mark renewal cycle as complete
     */
    private function markRenewalComplete(): void
    {
        $status = $this->getRenewalStatus();
        $status['is_complete'] = true;
        $status['completed_at'] = now()->toIso8601String();
        $this->updateRenewalProgress($status);
    }

    /**
     * Reset renewal status for new cycle
     */
    private function resetRenewalStatus(): void
    {
        $this->updateRenewalProgress([
            'last_account_id' => 0,
            'total_processed' => 0,
            'renewed_count' => 0,
            'failed_count' => 0,
            'is_complete' => false,
            'started_at' => now()->toIso8601String(),
        ]);
    }

    /**
     * Get renewal statistics
     */
    public function getRenewalStats(): array
    {
        $status = $this->getRenewalStatus();

        return [
            'status' => $status['is_complete'] ? 'complete' : 'in_progress',
            'total_processed' => $status['total_processed'] ?? 0,
            'renewed_count' => $status['renewed_count'] ?? 0,
            'failed_count' => $status['failed_count'] ?? 0,
            'last_account_id' => $status['last_account_id'] ?? 0,
            'started_at' => $status['started_at'] ?? null,
            'completed_at' => $status['completed_at'] ?? null,
        ];
    }

    /**
     * Get accounts that require re-authentication
     */
    public function getAccountsRequiringReauth(): array
    {
        return ConnectedAccount::where('requires_reauthentication', true)
            ->where('connection_type', 'oauth')
            ->select('id', 'email', 'display_name', 'last_token_refresh_at')
            ->orderBy('last_token_refresh_at')
            ->get()
            ->toArray();
    }
}
