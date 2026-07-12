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
}
