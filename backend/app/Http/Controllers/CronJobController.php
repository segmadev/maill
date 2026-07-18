<?php

namespace App\Http\Controllers;

use App\Services\SafeTokenRenewalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class CronJobController extends Controller
{
    public function __construct(
        private SafeTokenRenewalService $tokenRenewalService,
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
            $result = $this->tokenRenewalService->renewTokensBatchSafe();

            $statusCode = $result['success'] ? 200 : ($result['status'] === 'already_running' ? 429 : 500);
            Log::info('Cron token renewal executed', $result);

            return response()->json($result, $statusCode);
        } catch (\Throwable $e) {
            Log::error('Cron job fatal error: ' . $e->getMessage(), [
                'exception' => get_class($e),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);
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
     *
     * Parameters:
     * - force=true: Clear ALL logs regardless of size
     * - force=false: Skip clearing, just report status
     * - no parameter: Clear only logs > 50MB (default)
     *
     * Clears:
     * - *.log files in storage/logs
     * - *.log files in storage/logs subdirectories
     * - laravel-YYYY-MM-DD.log rotated files
     */
    public function clearLargeLogs(Request $request): JsonResponse
    {
        try {
            $force = $request->query('force');

            // If force=false, skip clearing
            if ($force === 'false') {
                return response()->json([
                    'success' => true,
                    'message' => 'Log clearing disabled (force=false)',
                    'action' => 'skipped',
                    'cleared_count' => 0,
                    'freed_mb' => 0,
                ]);
            }

            $maxSizeMB = $force === 'true' ? 0 : 50; // If force=true, clear all (0 = no minimum)
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

            // Get all log files: both in root and subdirectories
            $files = array_merge(
                glob($logPath . '/*.log'),                    // Root level: *.log
                glob($logPath . '/laravel-*.log'),            // Rotated: laravel-YYYY-MM-DD.log
                glob($logPath . '/**/*.log', GLOB_BRACE)      // Subdirectories: */*.log
            );

            // Remove duplicates
            $files = array_unique($files);

            foreach ($files as $file) {
                if (!is_file($file)) {
                    continue; // Skip if not a file (e.g., directory)
                }

                $fileSize = filesize($file);

                // Clear if: force=true (all files) OR fileSize > threshold
                if ($force === 'true' || $fileSize > $maxSizeBytes) {
                    $fileSizeMB = round($fileSize / (1024 * 1024), 2);

                    try {
                        file_put_contents($file, '');
                        $clearedCount++;
                        $totalFreed += $fileSize;

                        // Get relative path from logs directory
                        $relativePath = str_replace($logPath . '/', '', $file);

                        $clearedFiles[] = [
                            'file' => $relativePath,
                            'size_mb' => $fileSizeMB,
                        ];

                        $reason = $force === 'true' ? 'force=true' : "exceeded {$maxSizeMB}MB";
                        Log::warning("Log file cleared via API: $relativePath ({$reason}, was {$fileSizeMB}MB)");
                    } catch (\Exception $e) {
                        Log::error("Failed to clear log file $file: " . $e->getMessage());
                    }
                }
            }

            $totalFreedMB = round($totalFreed / (1024 * 1024), 2);

            return response()->json([
                'success' => true,
                'message' => $clearedCount === 0
                    ? "No logs to clear"
                    : "Cleared $clearedCount log file(s)",
                'action' => $force === 'true' ? 'forced_clear' : 'conditional_clear',
                'cleared_count' => $clearedCount,
                'freed_mb' => $totalFreedMB,
                'cleared_files' => $clearedFiles,
                'force_parameter' => $force,
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
