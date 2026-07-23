<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Provides current access token for API requests
 * Works with both BFF OAuth and JWT systems
 */
class CurrentUserTokenService
{
    private TokenManagementService $tokenService;

    public function __construct(TokenManagementService $tokenService = null)
    {
        $this->tokenService = $tokenService ?? new TokenManagementService();
    }

    /**
     * Get current access token from request
     * Supports both:
     * - BFF OAuth (stored in oauth_sessions)
     * - JWT Bearer token (in Authorization header)
     */
    public function getAccessToken(Request $request): ?string
    {
        // Try BFF OAuth first
        $oauthSession = $request->attributes->get('oauth_session');
        if ($oauthSession) {
            return $this->tokenService->getAccessToken($oauthSession);
        }

        // Fall back to JWT Bearer token
        if ($request->hasHeader('Authorization')) {
            $header = $request->header('Authorization');
            if (str_starts_with($header, 'Bearer ')) {
                return substr($header, 7);
            }
        }

        return null;
    }

    /**
     * Get Microsoft Graph authorization header
     */
    public function getAuthorizationHeader(Request $request): ?string
    {
        $token = $this->getAccessToken($request);

        if (!$token) {
            return null;
        }

        return "Bearer {$token}";
    }

    /**
     * Check if request has valid access token
     */
    public function hasValidAccessToken(Request $request): bool
    {
        return $this->getAccessToken($request) !== null;
    }
}
