<?php

namespace App\Http\Middleware;

use App\Models\ConnectedAccount;
use App\Services\ConnectedAccountTokenService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Auto-refresh connected account OAuth tokens before Graph API calls
 * Runs before Graph API requests to ensure tokens are fresh
 */
class ConnectedAccountTokenRefreshMiddleware
{
    private ConnectedAccountTokenService $tokenService;

    public function __construct(ConnectedAccountTokenService $tokenService = null)
    {
        $this->tokenService = $tokenService ?? new ConnectedAccountTokenService();
    }

    public function handle(Request $request, Closure $next): Response
    {
        // Get connected account from request (set by controller or previous middleware)
        $accountId = $request->route('account_id') ?? $request->input('account_id');

        if (!$accountId) {
            return $next($request);
        }

        $account = ConnectedAccount::find($accountId);
        if (!$account) {
            return $next($request);
        }

        // Check if account requires re-auth
        if ($this->tokenService->requiresReauth($account)) {
            return response()->json([
                'error' => 'requires_reauth',
                'message' => 'Account requires re-authentication',
                'account_id' => $account->id,
                'email' => $account->email,
                'last_error' => $account->last_refresh_error,
            ], 401);
        }

        // Ensure token is fresh (auto-refresh if needed)
        $token = $this->tokenService->ensureAccessTokenValid($account);

        if (!$token) {
            // Token couldn't be refreshed, need re-auth
            $this->tokenService->markRequiresReauth($account, 'Failed to refresh token');

            return response()->json([
                'error' => 'requires_reauth',
                'message' => 'Failed to refresh token, please re-authenticate',
                'account_id' => $account->id,
            ], 401);
        }

        // Store token and account for use in the controller
        $request->attributes->set('connected_account', $account);
        $request->attributes->set('microsoft_token', $token);

        return $next($request);
    }
}
