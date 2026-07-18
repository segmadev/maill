<?php

namespace App\Http\Controllers;

use App\Services\TokenRenewalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class CronJobController extends Controller
{
    public function __construct(
        private TokenRenewalService $tokenRenewalService,
    ) {}

    /**
     * GET /api/cron/renew-tokens
     * Renews ALL OAuth tokens for accounts in continuous batches
     *
     * This endpoint can be called directly from a browser or cron job.
     * Simply visit the URL or set up a cron job to hit it.
     *
     * It will:
     * 1. Process one batch of accounts (50 at a time)
     * 2. Renew their tokens regardless of expiry time
     * 3. Save progress to database
     * 4. Continue until all accounts are processed
     * 5. Then start over from the beginning in a continuous loop
     */
    public function renewTokens(): JsonResponse
    {
        try {
            $result = $this->tokenRenewalService->renewTokensBatch();

            $statusCode = $result['success'] ? 200 : 500;
            Log::info('Cron token renewal: ' . json_encode($result));

            return response()->json($result, $statusCode);
        } catch (\Exception $e) {
            Log::error('Cron job error: ' . $e->getMessage());
            return response()->json([
                'error' => 'cron_failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/cron/renewal-status
     * Get current token renewal cycle status
     */
    public function getRenewalStatus(): JsonResponse
    {
        try {
            $stats = $this->tokenRenewalService->getRenewalStats();
            return response()->json([
                'success' => true,
                'data' => $stats,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'status_failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/cron/accounts-requiring-reauth
     * Get list of accounts that need re-authentication
     * (refresh token expired, will need user to reconnect)
     */
    public function getAccountsRequiringReauth(): JsonResponse
    {
        try {
            $accounts = $this->tokenRenewalService->getAccountsRequiringReauth();
            return response()->json([
                'success' => true,
                'count' => count($accounts),
                'accounts' => $accounts,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'reauth_check_failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/cron/clear-logs
     * Clear log files when they exceed 50MB
     * Can be called from browser or cron job
     */
    public function clearLargeLogs(): JsonResponse
    {
        try {
            $maxSizeMB = 50;
            $maxSizeBytes = $maxSizeMB * 1024 * 1024;

            $logPath = storage_path('logs');
            $clearedCount = 0;
            $totalFreed = 0;
            $clearedFiles = [];

            if (!is_dir($logPath)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Log directory not found',
                ], 500);
            }

            $files = glob($logPath . '/*.log');

            foreach ($files as $file) {
                $fileSize = filesize($file);

                if ($fileSize > $maxSizeBytes) {
                    $fileSizeMB = round($fileSize / (1024 * 1024), 2);

                    try {
                        file_put_contents($file, '');
                        $clearedCount++;
                        $totalFreed += $fileSize;
                        $clearedFiles[] = [
                            'file' => basename($file),
                            'size_mb' => $fileSizeMB,
                        ];
                        Log::warning("Log file cleared via API: $file (was {$fileSizeMB}MB)");
                    } catch (\Exception $e) {
                        Log::error("Failed to clear log file $file: " . $e->getMessage());
                    }
                }
            }

            $totalFreedMB = round($totalFreed / (1024 * 1024), 2);

            return response()->json([
                'success' => true,
                'message' => $clearedCount === 0
                    ? "All logs are below {$maxSizeMB}MB"
                    : "Cleared $clearedCount log file(s)",
                'cleared_count' => $clearedCount,
                'freed_mb' => $totalFreedMB,
                'cleared_files' => $clearedFiles,
            ]);
        } catch (\Exception $e) {
            Log::error('Log clear failed: ' . $e->getMessage());
            return response()->json([
                'error' => 'clear_logs_failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
