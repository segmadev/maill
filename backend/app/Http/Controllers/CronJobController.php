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
     * POST /api/cron/renew-tokens
     * Renews OAuth tokens for accounts in batches
     *
     * This endpoint should be called by your cron job scheduler periodically
     * (recommended: every 5-10 minutes)
     *
     * It will:
     * 1. Process one batch of accounts
     * 2. Renew their tokens if expiring soon
     * 3. Save progress to database
     * 4. Continue until all accounts are processed
     * 5. Then start over in a loop
     */
    public function renewTokens(Request $request): JsonResponse
    {
        // Optional: Validate cron job secret token for security
        $cronSecret = $request->header('X-Cron-Secret');
        if ($cronSecret && $cronSecret !== config('app.cron_secret')) {
            Log::warning('Unauthorized cron job attempt');
            return response()->json([
                'error' => 'unauthorized',
                'message' => 'Invalid cron secret',
            ], 401);
        }

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
