<?php

namespace App\Http\Controllers;

use App\Services\AlertService;
use App\Models\ConnectedAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Alert Management API
 *
 * Get alerts, resolve alerts, manage alert preferences
 */
class AlertController extends Controller
{
    public function __construct(
        private AlertService $alertService,
    ) {}

    /**
     * GET /api/alerts/{accountId}/active
     * Get all active alerts for an account
     */
    public function getActiveAlerts($accountId): JsonResponse
    {
        $account = ConnectedAccount::find($accountId);
        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $alerts = $this->alertService->getActiveAlerts($accountId);

        return response()->json([
            'success' => true,
            'alerts' => $alerts,
            'count' => count($alerts),
        ]);
    }

    /**
     * GET /api/alerts/{accountId}/history
     * Get alert history for an account (default: last 7 days)
     */
    public function getAlertHistory($accountId, Request $request): JsonResponse
    {
        $account = ConnectedAccount::find($accountId);
        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $days = (int)$request->input('days', 7);
        $alerts = $this->alertService->getAlertHistory($accountId, $days);

        return response()->json([
            'success' => true,
            'alerts' => $alerts,
            'period_days' => $days,
        ]);
    }

    /**
     * GET /api/alerts/{accountId}/stats
     * Get alert statistics
     */
    public function getAlertStats($accountId, Request $request): JsonResponse
    {
        $account = ConnectedAccount::find($accountId);
        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $days = (int)$request->input('days', 7);
        $stats = $this->alertService->getAlertStats($accountId, $days);

        return response()->json([
            'success' => true,
            'stats' => $stats,
        ]);
    }

    /**
     * POST /api/alerts/{alertId}/resolve
     * Mark an alert as resolved
     */
    public function resolveAlert($alertId): JsonResponse
    {
        $resolved = $this->alertService->resolveAlert($alertId);

        if (!$resolved) {
            return response()->json(['error' => 'Alert not found'], 404);
        }

        return response()->json([
            'success' => true,
            'message' => 'Alert resolved',
        ]);
    }

    /**
     * POST /api/alerts/{alertId}/dismiss
     * Dismiss an alert (don't resolve, just hide)
     */
    public function dismissAlert($alertId): JsonResponse
    {
        $updated = DB::table('account_alerts')
            ->where('id', $alertId)
            ->update([
                'status' => 'dismissed',
                'dismissed_at' => now(),
            ]);

        if (!$updated) {
            return response()->json(['error' => 'Alert not found'], 404);
        }

        return response()->json([
            'success' => true,
            'message' => 'Alert dismissed',
        ]);
    }

    /**
     * GET /api/alerts/{accountId}/preferences
     * Get alert notification preferences
     */
    public function getPreferences($accountId): JsonResponse
    {
        $account = ConnectedAccount::find($accountId);
        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $prefs = DB::table('alert_preferences')
            ->where('account_id', $accountId)
            ->first();

        if (!$prefs) {
            // Return defaults
            $prefs = (object)[
                'account_id' => $accountId,
                'email_alerts' => true,
                'slack_alerts' => false,
                'critical_only' => false,
                'slack_webhook' => null,
                'alert_email' => null,
            ];
        }

        return response()->json([
            'success' => true,
            'preferences' => $prefs,
        ]);
    }

    /**
     * PATCH /api/alerts/{accountId}/preferences
     * Update alert notification preferences
     */
    public function updatePreferences($accountId, Request $request): JsonResponse
    {
        $account = ConnectedAccount::find($accountId);
        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $data = $request->only([
            'email_alerts',
            'slack_alerts',
            'critical_only',
            'slack_webhook',
            'alert_email',
        ]);

        // Check if preferences exist
        $exists = DB::table('alert_preferences')
            ->where('account_id', $accountId)
            ->exists();

        if ($exists) {
            DB::table('alert_preferences')
                ->where('account_id', $accountId)
                ->update(array_merge($data, ['updated_at' => now()]));
        } else {
            DB::table('alert_preferences')
                ->insert(array_merge($data, [
                    'account_id' => $accountId,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]));
        }

        return response()->json([
            'success' => true,
            'message' => 'Preferences updated',
        ]);
    }

    /**
     * POST /api/alerts/{accountId}/check
     * Manually trigger health check and create alerts
     */
    public function checkAccountHealth($accountId): JsonResponse
    {
        $account = ConnectedAccount::find($accountId);
        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $alerts = $this->alertService->checkAccountHealth($accountId);

        return response()->json([
            'success' => true,
            'alerts_created' => $alerts,
            'count' => count($alerts),
        ]);
    }
}
