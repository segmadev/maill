<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use App\Models\OAuthSession;
use App\Services\TokenManagementService;
use Symfony\Component\HttpFoundation\Response;

class OAuthSessionMiddleware
{
    private TokenManagementService $tokenService;

    public function __construct(TokenManagementService $tokenService = null)
    {
        $this->tokenService = $tokenService ?? new TokenManagementService();
    }

    public function handle(Request $request, Closure $next): Response
    {
        // Get session token from cookie
        $sessionToken = $request->cookie('oauth_session');

        if (!$sessionToken) {
            return response()->json(['error' => 'unauthorized', 'message' => 'No session'], 401);
        }

        // Find OAuth session
        $oauthSession = OAuthSession::where('session_token', $sessionToken)->first();

        if (!$oauthSession) {
            return response()->json(['error' => 'unauthorized', 'message' => 'Invalid session'], 401);
        }

        // Check if session is expired
        if (!$oauthSession->isSessionValid()) {
            return response()->json(['error' => 'unauthorized', 'message' => 'Session expired'], 401);
        }

        // Check if re-authentication is required
        if ($oauthSession->requires_reauth) {
            return response()->json([
                'error' => 'requires_reauth',
                'message' => 'Please re-authenticate',
                'error_description' => $oauthSession->last_refresh_error,
            ], 401);
        }

        // Ensure access token is valid (refresh if needed)
        if (!$this->tokenService->ensureAccessTokenValid($oauthSession)) {
            return response()->json([
                'error' => 'token_invalid',
                'message' => 'Failed to refresh access token',
            ], 401);
        }

        // Update last activity
        $oauthSession->updateActivity();

        // Attach session and user to request
        $request->attributes->set('oauth_session', $oauthSession);
        $request->setUserResolver(function () use ($oauthSession) {
            return $oauthSession->user;
        });

        return $next($request);
    }
}
