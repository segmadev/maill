<?php

namespace App\Http\Controllers;

use App\Services\EmailHealthCheckerService;
use App\Services\IPWarmupService;
use App\Services\BounceComplaintTrackerService;
use App\Models\ConnectedAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Email Health & Deliverability Controller
 *
 * Provides endpoints to check email health before sending
 */
class EmailHealthController extends Controller
{
    public function __construct(
        private EmailHealthCheckerService $healthChecker,
        private IPWarmupService $warmupService,
        private BounceComplaintTrackerService $bounceTracker,
    ) {}

    /**
     * POST /api/email-health/check
     *
     * Check email health before sending
     *
     * Validates subject line, body content, sender reputation, DNS setup, etc.
     * Returns a health score and recommendations for improvement.
     */
    public function check(Request $request): JsonResponse
    {
        $accountId = (int)$request->input('account_id');
        $subject = trim((string)$request->input('subject', ''));
        $body = (string)$request->input('body', '');
        $senderEmail = $request->input('sender_email');

        // Validate input
        if (!$accountId || !$subject || !$body) {
            return response()->json([
                'error' => 'Missing required fields: account_id, subject, body',
            ], 422);
        }

        // Get account for domain info
        $account = ConnectedAccount::find($accountId);
        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $senderEmail = $senderEmail ?? $account->email;
        $domain = substr(strrchr($senderEmail, "@"), 1);

        try {
            // Check email health
            $healthReport = $this->healthChecker->checkEmailHealth(
                $senderEmail,
                $subject,
                $body,
                $domain,
                $accountId
            );

            // Check IP warmup status
            $warmupStatus = $this->warmupService->getWarmupStatus($accountId);

            // Check bounce/complaint health
            $senderHealth = $this->bounceTracker->getHealthScore($accountId);

            return response()->json([
                'success' => true,
                'health' => $healthReport,
                'warmup' => $warmupStatus,
                'sender_reputation' => $senderHealth,
                'can_send' => $this->canSendEmail($healthReport, $warmupStatus, $senderHealth),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Health check failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/email-health/warmup-status/:account_id
     *
     * Get IP warmup status and rate limits
     */
    public function warmupStatus($accountId): JsonResponse
    {
        $accountId = (int)$accountId;

        $account = ConnectedAccount::find($accountId);
        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $status = $this->warmupService->getWarmupStatus($accountId);

        return response()->json([
            'success' => true,
            'warmup_status' => $status,
        ]);
    }

    /**
     * POST /api/email-health/check-rate-limit
     *
     * Check if we can send now or need to rate-limit
     */
    public function checkRateLimit(Request $request): JsonResponse
    {
        $accountId = (int)$request->input('account_id');
        $emailsToSend = (int)$request->input('emails_to_send', 1);

        $account = ConnectedAccount::find($accountId);
        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $result = $this->warmupService->checkRateLimit($accountId, $emailsToSend);

        return response()->json([
            'success' => $result['canSend'],
            'rate_limit' => $result,
        ]);
    }

    /**
     * GET /api/email-health/sender-reputation/:account_id
     *
     * Get sender reputation score and metrics
     */
    public function senderReputation($accountId): JsonResponse
    {
        $accountId = (int)$accountId;

        $account = ConnectedAccount::find($accountId);
        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $reputation = $this->bounceTracker->getHealthScore($accountId);
        $bounceStats = $this->bounceTracker->getBounceStats($accountId);
        $complaintStats = $this->bounceTracker->getComplaintStats($accountId);

        return response()->json([
            'success' => true,
            'reputation' => $reputation,
            'bounce_stats' => $bounceStats,
            'complaint_stats' => $complaintStats,
        ]);
    }

    /**
     * GET /api/email-health/bounce-report/:account_id
     *
     * Get bounce report for last 7 days
     */
    public function bounceReport($accountId): JsonResponse
    {
        $accountId = (int)$accountId;
        $days = request()->input('days', 7);

        $account = ConnectedAccount::find($accountId);
        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $report = $this->bounceTracker->getBounceReport($accountId, $days);

        return response()->json([
            'success' => true,
            'bounce_report' => $report,
        ]);
    }

    /**
     * GET /api/email-health/complaint-report/:account_id
     *
     * Get complaint report for last 7 days
     */
    public function complaintReport($accountId): JsonResponse
    {
        $accountId = (int)$accountId;
        $days = request()->input('days', 7);

        $account = ConnectedAccount::find($accountId);
        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $report = $this->bounceTracker->getComplaintReport($accountId, $days);

        return response()->json([
            'success' => true,
            'complaint_report' => $report,
        ]);
    }

    /**
     * GET /api/email-health/suppression-list/:account_id
     *
     * Get suppression list (bounces and complaints)
     */
    public function suppressionList($accountId): JsonResponse
    {
        $accountId = (int)$accountId;
        $limit = (int)request()->input('limit', 100);
        $offset = (int)request()->input('offset', 0);

        $account = ConnectedAccount::find($accountId);
        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $suppressions = $this->bounceTracker->getSuppressionList($accountId, $limit, $offset);

        return response()->json([
            'success' => true,
            'suppression_list' => $suppressions,
        ]);
    }

    /**
     * Determine if email can be sent based on all checks
     */
    private function canSendEmail(array $health, array $warmup, array $reputation): bool
    {
        // Check health score
        if (!empty($health['issues'])) {
            return false; // Critical issues block sending
        }

        // Check reputation
        if ($reputation['health_score'] < 30) {
            return false; // Critical reputation issues
        }

        return true;
    }
}
