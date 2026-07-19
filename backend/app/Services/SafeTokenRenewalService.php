<?php

namespace App\Services;

use App\Models\ConnectedAccount;
use App\Models\SystemStatus;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;

class SafeTokenRenewalService
{
    private const BATCH_SIZE = 50;
    private const STATUS_KEY = 'token_renewal_progress';
    private const MAX_EXECUTION_TIME = 240; // 4 minutes max per execution
    private const MEMORY_LIMIT_MB = 100; // Stop if memory usage exceeds 100MB
    private const MAX_RETRIES = 3;

    private $startTime;
    private $initialMemory;

    public function renewTokensBatchSafe(): array
    {
        $this->startTime = microtime(true);
        $this->initialMemory = memory_get_usage() / 1024 / 1024;

        try {
            // Check if already running (prevent concurrent execution)
            if ($this->isAlreadyRunning()) {
                return [
                    'success' => false,
                    'message' => 'Token renewal already running',
                    'status' => 'already_running',
                ];
            }

            // Mark as running
            $this->markAsRunning();

            // Check memory before starting
            if ($this->getMemoryUsageMB() > 150) {
                Log::warning('Skipping token renewal: Memory usage too high', [
                    'memory_mb' => $this->getMemoryUsageMB(),
                ]);
                return [
                    'success' => false,
                    'message' => 'Memory usage too high, skipping renewal',
                    'memory_mb' => $this->getMemoryUsageMB(),
                ];
            }

            $status = $this->getRenewalStatus();

            if ($status['is_complete']) {
                $this->resetRenewalStatus();
                $status = $this->getRenewalStatus();
                Log::info('Token renewal cycle reset');
            }

            $batch = $this->getNextBatch($status['last_account_id'] ?? 0);

            if (empty($batch)) {
                $this->markRenewalComplete();
                $this->clearRunningFlag();
                return [
                    'success' => true,
                    'message' => 'Cycle complete',
                    'cycle_complete' => true,
                ];
            }

            $renewalResults = $this->renewAccountTokens($batch);

            $lastAccountId = end($batch)?->id ?? 0;
            $totalProcessed = ($status['total_processed'] ?? 0) + count($batch);

            $this->updateRenewalProgress([
                'last_account_id' => $lastAccountId,
                'total_processed' => $totalProcessed,
                'renewed_count' => $renewalResults['renewed_count'],
                'failed_count' => $renewalResults['failed_count'],
                'is_complete' => false,
            ]);

            Log::info("Token renewal batch: {$renewalResults['renewed_count']} renewed, {$renewalResults['failed_count']} failed", [
                'memory_mb' => $this->getMemoryUsageMB(),
                'elapsed_seconds' => $this->getElapsedTime(),
            ]);

            $this->clearRunningFlag();

            return [
                'success' => true,
                'message' => 'Batch renewal completed',
                'renewed_count' => $renewalResults['renewed_count'],
                'failed_count' => $renewalResults['failed_count'],
                'total_processed' => $totalProcessed,
                'batch_size' => count($batch),
                'cycle_complete' => false,
                'memory_mb' => $this->getMemoryUsageMB(),
            ];
        } catch (\Throwable $e) {
            Log::error('Token renewal fatal error', [
                'error' => $e->getMessage(),
                'class' => get_class($e),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'memory_mb' => $this->getMemoryUsageMB(),
            ]);

            $this->clearRunningFlag();

            return [
                'success' => false,
                'error' => 'renewal_failed',
                'message' => $e->getMessage(),
            ];
        } finally {
            // Always close database connections
            try {
                DB::disconnect();
            } catch (\Exception $e) {
                Log::warning('Failed to disconnect database: ' . $e->getMessage());
            }
        }
    }

    private function renewAccountTokens(array $batch): array
    {
        $renewed = [];
        $failed = [];

        foreach ($batch as $account) {
            // Check if we're running out of time
            if ($this->getElapsedTime() > self::MAX_EXECUTION_TIME) {
                Log::warning('Token renewal timeout: Max execution time exceeded', [
                    'elapsed_seconds' => $this->getElapsedTime(),
                    'accounts_processed' => count($renewed) + count($failed),
                ]);
                break;
            }

            // Check memory
            if ($this->getMemoryUsageMB() > self::MEMORY_LIMIT_MB) {
                Log::warning('Token renewal memory limit exceeded', [
                    'memory_mb' => $this->getMemoryUsageMB(),
                    'accounts_processed' => count($renewed) + count($failed),
                ]);
                break;
            }

            try {
                if ($this->renewAccountToken($account)) {
                    $renewed[] = $account->id;
                } else {
                    $failed[] = [
                        'account_id' => $account->id,
                        'email' => $account->email,
                        'reason' => 'Refresh failed',
                    ];
                }
            } catch (\Throwable $e) {
                Log::error("Renewal error for account {$account->id}", [
                    'error' => $e->getMessage(),
                    'class' => get_class($e),
                ]);
                $failed[] = [
                    'account_id' => $account->id,
                    'email' => $account->email,
                    'reason' => $e->getMessage(),
                ];
            }

            // Free memory periodically
            if (count($renewed) + count($failed) % 10 === 0) {
                gc_collect_cycles();
            }
        }

        return [
            'renewed' => $renewed,
            'failed' => $failed,
            'renewed_count' => count($renewed),
            'failed_count' => count($failed),
        ];
    }

    private function renewAccountToken(ConnectedAccount $account): bool
    {
        if (!$account->refresh_token) {
            return false;
        }

        // Check if refresh token has already expired
        if ($account->refreshTokenIsExpired()) {
            Log::warning("Refresh token has expired for account {$account->id}", [
                'email' => $account->email,
                'refresh_token_expired_at' => $account->refresh_token_expires_at,
            ]);
            return false;
        }

        $retryCount = 0;
        $lastError = null;

        while ($retryCount < self::MAX_RETRIES) {
            try {
                $encryptionService = app(TokenEncryptionService::class);
                $refreshToken = $encryptionService->decrypt($account->refresh_token);

                if ($account->connection_type === 'oauth_manual') {
                    $clientId = $account->oauth_client_id;
                    $clientSecret = $encryptionService->decrypt($account->oauth_client_secret);
                    $tenantId = $account->oauth_tenant_id ?? 'common';
                } else {
                    $clientId = config('microsoft.client_id');
                    $clientSecret = config('microsoft.client_secret');
                    $tenantId = config('microsoft.tenant_id', 'common');
                }

                $isPublicClient = config('microsoft.is_public_client', false);
                $scopeString = 'https://graph.microsoft.com/.default';
                if (!empty($account->oauth_scopes)) {
                    $decodedScopes = json_decode($account->oauth_scopes, true);
                    if (is_array($decodedScopes)) {
                        $scopeString = implode(' ', $decodedScopes);
                    }
                }

                $params = [
                    'grant_type' => 'refresh_token',
                    'client_id' => $clientId,
                    'refresh_token' => $refreshToken,
                    'scope' => $scopeString,
                ];

                if (!$isPublicClient && !empty($clientSecret)) {
                    $params['client_secret'] = $clientSecret;
                }

                // Use CURL with explicit timeout
                $ch = curl_init("https://login.microsoftonline.com/{$tenantId}/oauth2/v2.0/token");
                $body = http_build_query($params);

                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_CUSTOMREQUEST => 'POST',
                    CURLOPT_HTTPHEADER => [
                        'Content-Type: application/x-www-form-urlencoded',
                        'Origin: ' . rtrim(config('app.url'), '/'),
                    ],
                    CURLOPT_POSTFIELDS => $body,
                    CURLOPT_TIMEOUT => 10, // Reduced from 15 to 10
                    CURLOPT_CONNECTTIMEOUT => 5,
                ]);

                $responseStr = curl_exec($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                $curlError = curl_error($ch);
                curl_close($ch); // Always close

                if ($curlError) {
                    $lastError = "CURL: $curlError";
                    $retryCount++;
                    sleep(1); // Wait before retry
                    continue;
                }

                $data = json_decode($responseStr, true);

                if (!isset($data['access_token'])) {
                    $lastError = $data['error_description'] ?? $data['error'] ?? 'No access_token';
                    $retryCount++;
                    sleep(1);
                    continue;
                }

                // Success
                $expiresIn = (int) ($data['expires_in'] ?? 3600);
                $account->update([
                    'access_token' => $encryptionService->encrypt($data['access_token']),
                    'token_expires_at' => now()->addSeconds($expiresIn),
                    'refresh_token' => $encryptionService->encrypt($data['refresh_token'] ?? $refreshToken),
                    'last_token_refresh_at' => now(),
                    'refresh_failed_count' => 0,
                ]);

                return true;
            } catch (\Throwable $e) {
                $lastError = $e->getMessage();
                $retryCount++;
                if ($retryCount < self::MAX_RETRIES) {
                    sleep(1);
                }
            }
        }

        // All retries exhausted
        Log::warning("Token refresh failed after {$retryCount} retries", [
            'account_id' => $account->id,
            'last_error' => $lastError,
        ]);

        $account->increment('refresh_failed_count');

        return false;
    }

    private function getNextBatch(int $lastAccountId = 0): array
    {
        try {
            return ConnectedAccount::query()
                ->where('id', '>', $lastAccountId)
                ->where(function ($query) {
                    $query->where('connection_type', 'oauth')
                        ->orWhere('connection_type', 'oauth_manual');
                })
                ->whereNotNull('refresh_token')
                ->orderBy('id')
                ->take(self::BATCH_SIZE)
                ->get()
                ->all();
        } catch (\Exception $e) {
            Log::error('Failed to get next batch: ' . $e->getMessage());
            return [];
        }
    }

    private function isAlreadyRunning(): bool
    {
        try {
            $status = SystemStatus::where('key', 'token_renewal_running')->first();
            if (!$status) {
                return false;
            }

            $value = $status->value ?? [];
            $runningTime = $value['started_at'] ?? null;

            if (!$runningTime) {
                return false;
            }

            $startTime = strtotime($runningTime);
            $elapsed = time() - $startTime;

            // If running for more than 15 minutes, consider it stuck
            if ($elapsed > 900) {
                Log::warning('Token renewal stuck for ' . $elapsed . 's, clearing lock');
                $this->clearRunningFlag();
                return false;
            }

            return true;
        } catch (\Exception $e) {
            Log::warning('Failed to check running status: ' . $e->getMessage());
            return false;
        }
    }

    private function markAsRunning(): void
    {
        try {
            SystemStatus::updateOrCreate(
                ['key' => 'token_renewal_running'],
                ['value' => ['started_at' => now()->toIso8601String()]]
            );
        } catch (\Exception $e) {
            Log::warning('Failed to mark as running: ' . $e->getMessage());
        }
    }

    private function clearRunningFlag(): void
    {
        try {
            SystemStatus::where('key', 'token_renewal_running')->delete();
        } catch (\Exception $e) {
            Log::warning('Failed to clear running flag: ' . $e->getMessage());
        }
    }

    private function getRenewalStatus(): array
    {
        try {
            $status = SystemStatus::where('key', self::STATUS_KEY)->first();
            return $status?->value ?? [
                'last_account_id' => 0,
                'is_complete' => true,
            ];
        } catch (\Exception $e) {
            Log::warning('Failed to get renewal status: ' . $e->getMessage());
            return ['last_account_id' => 0, 'is_complete' => true];
        }
    }

    private function updateRenewalProgress(array $data): void
    {
        try {
            SystemStatus::updateOrCreate(['key' => self::STATUS_KEY], ['value' => $data]);
        } catch (\Exception $e) {
            Log::warning('Failed to update progress: ' . $e->getMessage());
        }
    }

    private function markRenewalComplete(): void
    {
        try {
            $status = $this->getRenewalStatus();
            $status['is_complete'] = true;
            $status['completed_at'] = now()->toIso8601String();
            $this->updateRenewalProgress($status);
        } catch (\Exception $e) {
            Log::warning('Failed to mark complete: ' . $e->getMessage());
        }
    }

    private function resetRenewalStatus(): void
    {
        try {
            $this->updateRenewalProgress([
                'last_account_id' => 0,
                'is_complete' => false,
                'started_at' => now()->toIso8601String(),
            ]);
        } catch (\Exception $e) {
            Log::warning('Failed to reset status: ' . $e->getMessage());
        }
    }

    private function getMemoryUsageMB(): float
    {
        return round(memory_get_usage() / 1024 / 1024, 2);
    }

    private function getElapsedTime(): float
    {
        return microtime(true) - $this->startTime;
    }
}
