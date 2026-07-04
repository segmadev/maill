<?php

namespace App\Http\Controllers;

use App\Models\ConnectedAccount;
use App\Services\OAuthAuthorizationService;
use App\Services\TokenRefreshService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class OAuthAuthorizationController extends Controller
{
    public function __construct(
        private OAuthAuthorizationService $oauthService,
        private TokenRefreshService $tokenRefreshService,
    ) {}

    /**
     * POST /api/admin/accounts/oauth-authorize/start
     *
     * Generate authorization URL for user to click
     * Admin can customize scopes, or use defaults
     */
    public function startAuthorization(Request $request): JsonResponse
    {
        if (!$request->user()?->is_admin) {
            return response()->json([
                'error' => 'unauthorized',
                'message' => 'Only admins can initiate OAuth flow.',
            ], 403);
        }

        $validated = $request->validate([
            'client_id' => 'required|string',
            'tenant_id' => 'required|string',
            'client_secret' => 'required|string',
            'email' => 'required|email',
            'scopes' => 'nullable|array',
            'scopes.*' => 'string',
        ]);

        try {
            // If using admin-settings markers, fetch actual credentials from Settings/config
            $clientId = $validated['client_id'];
            $clientSecret = $validated['client_secret'];
            $tenantId = $validated['tenant_id'];

            if ($validated['client_id'] === 'admin-settings') {
                $clientId = \App\Models\Setting::get('azure_client_id') ?: config('microsoft.client_id');
                if (!$clientId) {
                    throw new \Exception('Azure Client ID not configured in settings');
                }
            }

            if ($validated['client_secret'] === 'admin-settings') {
                $clientSecret = \App\Models\Setting::get('azure_client_secret') ?: config('microsoft.client_secret');
                if (!$clientSecret) {
                    throw new \Exception('Azure Client Secret not configured in settings');
                }
            }

            if ($validated['tenant_id'] === 'admin-settings') {
                $tenantId = \App\Models\Setting::get('azure_tenant_id') ?: config('microsoft.tenant_id', 'common');
            }

            Log::info('OAuth: Using credentials', [
                'client_id' => substr($clientId, 0, 10) . '...',
                'tenant_id' => $tenantId,
                'is_admin_settings' => $validated['client_id'] === 'admin-settings',
            ]);

            // Generate authorization URL with all credentials
            // This also stores credentials in database with state
            $result = $this->oauthService->generateAuthorizationUrl(
                $request->user()->id,
                $clientId,
                $clientSecret,
                $tenantId,
                $validated['email'],
                $validated['scopes'] ?? null
            );

            Log::info('OAuth authorization flow started', [
                'user_id' => $request->user()->id,
                'client_id' => $validated['client_id'],
                'scopes' => $result['scopes'],
            ]);

            return response()->json([
                'success' => true,
                'url' => $result['url'],
                'state' => $result['state'],
                'scopes' => $result['scopes'],
                'expires_at' => $result['expires_at'],
                'message' => 'Share this URL with user or click to log in',
            ]);
        } catch (\Exception $e) {
            Log::error('OAuth authorization start failed', ['error' => $e->getMessage()]);
            return response()->json([
                'error' => 'authorization_failed',
                'message' => 'Failed to generate authorization URL: ' . $e->getMessage(),
            ], 422);
        }
    }

    /**
     * GET /api/auth/microsoft/oauth-callback
     *
     * Microsoft redirects here after user logs in
     * FIXED: No redirect - just process silently
     * Frontend modal detects success/error via polling
     */
    public function handleAuthorizationCallback(Request $request)
    {
        $code = $request->query('code', '');
        $state = $request->query('state', '');
        $error = $request->query('error', '');

        Log::info('OAuth callback received', [
            'code' => substr($code, 0, 10) . '...',
            'state' => substr($state, 0, 10) . '...',
            'error' => $error,
        ]);

        // Retrieve credentials from database using state parameter
        $authState = \App\Models\OAuthAuthorizationState::where('state', $state)->first();

        if (!$authState) {
            Log::error('OAuth callback: State not found in database', [
                'state' => substr($state, 0, 10) . '...',
            ]);
            // Store error for frontend to detect
            return response()->json([
                'success' => false,
                'error' => 'state_not_found',
                'message' => 'Authorization state not found. Please start over.',
            ], 400);
        }

        // Check if state has expired
        if (now()->isAfter($authState->expires_at)) {
            Log::error('OAuth callback: State expired', [
                'expires_at' => $authState->expires_at,
                'now' => now(),
            ]);
            return response()->json([
                'success' => false,
                'error' => 'state_expired',
                'message' => 'Authorization URL expired. Please start over.',
            ], 400);
        }

        $clientId = $authState->client_id;
        $clientSecret = $authState->client_secret;
        $tenantId = $authState->tenant_id;
        $email = $authState->email;
        $userId = $authState->user_id;

        // Handle errors from Microsoft
        if (!empty($error)) {
            Log::error('OAuth: Error from Microsoft', [
                'error' => $error,
                'description' => $request->query('error_description', ''),
            ]);
            return response()->json([
                'success' => false,
                'error' => $error,
                'message' => $request->query('error_description', 'Authorization failed'),
            ], 400);
        }

        // Validate we have all required data
        if (!$code || !$state || !$clientId || !$clientSecret || !$tenantId || !$email || !$userId) {
            Log::error('OAuth: Missing required data');
            return response()->json([
                'success' => false,
                'error' => 'missing_data',
                'message' => 'Missing required authorization data.',
            ], 400);
        }

        try {
            Log::info('OAuth: Starting token exchange', [
                'state' => substr($state, 0, 20),
                'code' => substr($code, 0, 20),
                'client_id' => $clientId,
                'tenant_id' => $tenantId,
            ]);

            // Exchange code for tokens
            $result = $this->oauthService->handleCallback(
                $state,
                $code,
                $clientId,
                $clientSecret,
                $tenantId
            );

            Log::info('OAuth: Token exchange result', [
                'success' => $result['success'] ?? false,
                'error' => $result['error'] ?? null,
                'message' => $result['message'] ?? null,
            ]);

            if (!$result['success']) {
                Log::error('OAuth: Token exchange failed', [
                    'error' => $result['error'] ?? 'unknown',
                    'message' => $result['message'] ?? 'no message',
                ]);
                return response()->json([
                    'success' => false,
                    'error' => $result['error'] ?? 'token_exchange_failed',
                    'message' => $result['message'] ?? 'Failed to exchange authorization code for tokens',
                ], 400);
            }

            // Check if this is a hybrid account (adding OAuth to existing SMTP)
            $existingSmtpAccount = \App\Models\ConnectedAccount::where('user_id', $userId)
                ->where('email', $email)
                ->where('connection_type', 'smtp')
                ->first();

            $isHybrid = !!$existingSmtpAccount;

            // Save account to database
            Log::info('OAuth: Saving account to database', [
                'user_id' => $userId,
                'email' => $email,
                'is_hybrid' => $isHybrid,
            ]);

            $account = $this->oauthService->saveAccount(
                $userId,
                $email,
                $result['tokens'],
                $clientId,
                $clientSecret,
                $tenantId,
                $result['scopes'],
                $isHybrid  // Pass hybrid flag
            );

            // Delete the state record
            $authState->delete();

            Log::info('OAuth authorization completed successfully', [
                'user_id' => $userId,
                'account_id' => $account->id,
                'email' => $email,
            ]);

            // Cache success result for frontend to detect
            $cacheKey = "oauth_result_{$userId}_{$state}";
            \Cache::put($cacheKey, [
                'success' => true,
                'message' => 'Account connected successfully',
                'account_id' => $account->id,
                'email' => $account->email,
            ], now()->addMinutes(5));

            // Return HTML page that auto-closes the window on success
            return response()->view('oauth-success', [
                'email' => $account->email,
                'message' => 'Account connected successfully! This window will close automatically.',
            ], 200);

        } catch (\Exception $e) {
            Log::error('OAuth callback handling EXCEPTION', [
                'error' => $e->getMessage(),
                'exception_class' => get_class($e),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString(),
            ]);

            // Cache error result for frontend to detect
            $cacheKey = "oauth_result_{$userId}_" . ($state ?? 'unknown');
            \Cache::put($cacheKey, [
                'success' => false,
                'error' => 'callback_exception',
                'message' => 'An error occurred during authorization: ' . $e->getMessage(),
            ], now()->addMinutes(5));

            return response()->json([
                'success' => false,
                'error' => 'callback_exception',
                'message' => 'An error occurred during authorization: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * POST /api/admin/accounts/oauth-authorize/complete
     *
     * Frontend calls this after getting user's email from authorization flow
     * This links the authorization with user's email
     */
    public function completeAuthorization(Request $request): JsonResponse
    {
        if (!$request->user()?->is_admin) {
            return response()->json([
                'error' => 'unauthorized',
                'message' => 'Only admins can complete authorization.',
            ], 403);
        }

        $validated = $request->validate([
            'client_id' => 'required|string',
            'client_secret' => 'required|string',
            'tenant_id' => 'required|string',
            'email' => 'required|email',
            'scopes' => 'nullable|array',
        ]);

        // Store in session for callback handler
        session([
            'oauth_user_id' => $request->user()->id,
            'oauth_client_id' => $validated['client_id'],
            'oauth_client_secret' => $validated['client_secret'],
            'oauth_tenant_id' => $validated['tenant_id'],
            'oauth_email' => $validated['email'],
        ]);

        Log::info('OAuth authorization data stored in session', [
            'user_id' => $request->user()->id,
            'client_id' => $validated['client_id'],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Authorization data stored. Redirect user to authorization URL.',
        ]);
    }

    /**
     * GET /api/admin/oauth-status
     *
     * Check OAuth result (success or error)
     * Frontend polls this to detect callback results
     */
    public function checkOAuthStatus(Request $request): JsonResponse
    {
        $userId = $request->user()->id;
        $state = $request->query('state', '');

        if (!$state) {
            return response()->json([
                'success' => false,
                'message' => 'No state provided',
            ], 400);
        }

        $cacheKey = "oauth_result_{$userId}_{$state}";
        $result = \Cache::get($cacheKey);

        if ($result) {
            // Clear the cache after retrieving
            \Cache::forget($cacheKey);
            return response()->json($result);
        }

        // No result yet
        return response()->json([
            'success' => null,
            'message' => 'Still waiting for callback...',
        ], 200);
    }

    /**
     * GET /api/accounts/{id}/refresh-token
     *
     * Manual token refresh - works always (even if not expired)
     * Admin can refresh token anytime
     */
    public function refreshToken(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->is_admin) {
            return response()->json([
                'error' => 'unauthorized',
                'message' => 'Only admins can refresh tokens.',
            ], 403);
        }

        try {
            $account = ConnectedAccount::findOrFail($id);

            if ($account->connection_type !== 'oauth_manual') {
                return response()->json([
                    'error' => 'invalid_account',
                    'message' => 'This account does not support token refresh.',
                ], 422);
            }

            // Refresh the token (force refresh, not proactive)
            $success = $this->tokenRefreshService->refreshToken($account);

            if (!$success) {
                return response()->json([
                    'error' => 'refresh_failed',
                    'message' => 'Failed to refresh token. Account may need reconnection.',
                    'failure_count' => $account->refresh_failed_count,
                    'requires_reconnect' => $account->refresh_failed_count >= 3,
                ], 422);
            }

            // Refresh account data
            $account->refresh();

            Log::info('Token manually refreshed', [
                'user_id' => $request->user()->id,
                'account_id' => $account->id,
                'email' => $account->email,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Token refreshed successfully.',
                'account' => [
                    'id' => $account->id,
                    'email' => $account->email,
                    'token_expires_at' => $account->token_expires_at,
                    'minutes_remaining' => $account->minutesUntilTokenExpires(),
                    'last_refresh_attempt_at' => $account->last_refresh_attempt_at,
                ],
            ]);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException) {
            return response()->json([
                'error' => 'account_not_found',
                'message' => 'Account not found.',
            ], 404);
        } catch (\Exception $e) {
            Log::error('Token refresh failed', ['error' => $e->getMessage()]);
            return response()->json([
                'error' => 'refresh_failed',
                'message' => 'Failed to refresh token: ' . $e->getMessage(),
            ], 500);
        }
    }
}
