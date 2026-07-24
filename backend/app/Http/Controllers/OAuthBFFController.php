<?php

namespace App\Http\Controllers;

use App\Models\OAuthSession;
use App\Models\User;
use App\Services\TokenManagementService;
use App\Services\TokenEncryptionService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class OAuthBFFController extends Controller
{
    private TokenManagementService $tokenService;
    private TokenEncryptionService $encryption;

    public function __construct(
        TokenManagementService $tokenService = null,
        TokenEncryptionService $encryption = null
    ) {
        $this->tokenService = $tokenService ?? new TokenManagementService();
        $this->encryption = $encryption ?? new TokenEncryptionService();
    }

    /**
     * GET /api/auth/microsoft/login
     * Initiates OAuth flow - redirects to Microsoft Login
     */
    public function initiateLogin(Request $request): \Illuminate\Http\RedirectResponse
    {
        // Generate PKCE challenge
        $codeVerifier = Str::random(128);
        $codeChallenge = rtrim(strtr(base64_encode(hash('sha256', $codeVerifier, true)), '+/', '-_'), '=');

        // Generate state for CSRF protection
        $state = Str::random(32);

        // Store in session temporarily (5 minutes)
        $session = OAuthSession::create([
            'pkce_code_challenge' => $codeChallenge,
            'oauth_state' => $state,
            'state_expires_at' => now()->addMinutes(5),
            'session_token' => Str::random(64),
        ]);

        // Build authorization URL
        $tenantId = 'common'; // Support both personal and business accounts
        $clientId = config('microsoft.client_id');
        $redirectUri = route('oauth.callback');
        $scopes = [
            'openid',
            'profile',
            'email',
            'offline_access',
            'https://graph.microsoft.com/.default',
        ];

        $params = [
            'client_id' => $clientId,
            'response_type' => 'code',
            'redirect_uri' => $redirectUri,
            'scope' => implode(' ', $scopes),
            'response_mode' => 'query',
            'state' => $state,
            'code_challenge' => $codeChallenge,
            'code_challenge_method' => 'S256',
            'prompt' => 'select_account', // Allow account selection
        ];

        $authUrl = "https://login.microsoftonline.com/{$tenantId}/oauth2/v2.0/authorize?" . http_build_query($params);

        // Store session ID in cookie for retrieval in callback
        return redirect($authUrl)->withCookie(
            cookie('oauth_session_id', $session->id, 5)
        );
    }

    /**
     * GET /api/auth/microsoft/callback
     * Microsoft redirects here after user authorizes
     */
    public function handleCallback(Request $request): \Illuminate\Http\RedirectResponse
    {
        $code = $request->query('code');
        $state = $request->query('state');
        $error = $request->query('error');

        // Handle authorization errors
        if ($error) {
            Log::warning("OAuth authorization error", [
                'error' => $error,
                'error_description' => $request->query('error_description'),
            ]);
            return redirect(config('app.frontend_url') . '/login?error=oauth_failed');
        }

        if (!$code || !$state) {
            return redirect(config('app.frontend_url') . '/login?error=missing_params');
        }

        // Get the temporary OAuth session
        $sessionId = $request->cookie('oauth_session_id');
        $oauthSession = OAuthSession::find($sessionId);

        if (!$oauthSession || !$oauthSession->state_expires_at || now()->isAfter($oauthSession->state_expires_at)) {
            return redirect(config('app.frontend_url') . '/login?error=session_expired');
        }

        // Validate state
        if ($oauthSession->oauth_state !== $state) {
            Log::warning("OAuth state mismatch", [
                'expected' => $oauthSession->oauth_state,
                'received' => $state,
            ]);
            return redirect(config('app.frontend_url') . '/login?error=state_mismatch');
        }

        // Exchange code for tokens
        $tokenResponse = $this->exchangeCodeForTokens($code, $oauthSession);

        if ($tokenResponse['error']) {
            Log::error("Failed to exchange OAuth code", $tokenResponse);
            return redirect(config('app.frontend_url') . '/login?error=' . $tokenResponse['error']);
        }

        // Extract token data
        $accessToken = $tokenResponse['access_token'];
        $refreshToken = $tokenResponse['refresh_token'];
        $expiresIn = (int)($tokenResponse['expires_in'] ?? 3600);
        $idToken = $tokenResponse['id_token'] ?? null;

        // Decode ID token to get user info
        $userInfo = $this->decodeIdToken($idToken);

        if (!$userInfo) {
            return redirect(config('app.frontend_url') . '/login?error=invalid_id_token');
        }

        // Find or create user
        $user = User::where('email', $userInfo['email'])->first();

        if (!$user) {
            $user = User::create([
                'name' => $userInfo['name'] ?? $userInfo['email'],
                'email' => $userInfo['email'],
                'password' => bcrypt(Str::random(32)),
                'is_admin' => false,
            ]);
        }

        // Determine account type (personal or business)
        $accountType = $this->determineAccountType($userInfo);

        // Create or update OAuth session
        $oauthSession->update([
            'user_id' => $user->id,
            'microsoft_access_token' => $this->encryption->encrypt($accessToken),
            'microsoft_refresh_token' => $this->encryption->encrypt($refreshToken),
            'token_expires_at' => now()->addSeconds($expiresIn),
            'refresh_token_expires_at' => now()->addDays(90),
            'account_type' => $accountType,
            'tenant_id' => $userInfo['tid'] ?? 'common',
            'microsoft_email' => $userInfo['email'],
            'microsoft_user_id' => $userInfo['oid'] ?? $userInfo['sub'],
            'oauth_state' => null,
            'pkce_code_challenge' => null,
            'state_expires_at' => null,
            'session_token' => Str::random(64),
            'session_expires_at' => now()->addDays(30),
            'last_activity_at' => now(),
        ]);

        Log::info("OAuth session created", [
            'user_id' => $user->id,
            'email' => $user->email,
            'account_type' => $accountType,
        ]);

        // Set session cookie
        return redirect(config('app.frontend_url') . '/dashboard')->withCookie(
            cookie('oauth_session', $oauthSession->session_token, 43200, null, null, true, true)
        );
    }

    /**
     * Exchange authorization code for tokens
     */
    private function exchangeCodeForTokens(string $code, OAuthSession $oauthSession): array
    {
        $tenantId = 'common';
        $clientId = config('microsoft.client_id');
        $clientSecret = config('microsoft.client_secret');
        $redirectUri = route('oauth.callback');

        $params = [
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'code' => $code,
            'redirect_uri' => $redirectUri,
            'grant_type' => 'authorization_code',
            'code_verifier' => $oauthSession->pkce_code_challenge, // For PKCE validation
        ];

        $ch = curl_init("https://login.microsoftonline.com/{$tenantId}/oauth2/v2.0/token");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/x-www-form-urlencoded',
            'Origin: ' . rtrim(config('app.url'), '/'),
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            return ['error' => "CURL Error: $curlError"];
        }

        $data = json_decode($response, true);

        if ($httpCode >= 400) {
            return [
                'error' => $data['error'] ?? "HTTP $httpCode",
                'error_description' => $data['error_description'] ?? null,
            ];
        }

        return $data;
    }

    /**
     * Decode JWT ID token to extract user info
     */
    private function decodeIdToken(?string $idToken): ?array
    {
        if (!$idToken) {
            return null;
        }

        try {
            $parts = explode('.', $idToken);
            if (count($parts) !== 3) {
                return null;
            }

            // Decode payload (second part)
            $payload = json_decode(
                base64_decode(strtr($parts[1], '-_', '+/')),
                true
            );

            return $payload;
        } catch (\Exception $e) {
            Log::error("Failed to decode ID token", ['error' => $e->getMessage()]);
            return null;
        }
    }

    /**
     * Determine account type from user info
     */
    private function determineAccountType(array $userInfo): string
    {
        // Check for typical business account indicators
        if (isset($userInfo['tid']) && $userInfo['tid'] !== '9188040d-6c67-4c5b-b112-36a304b66dad') {
            return 'business';
        }

        // Check issuer
        if (isset($userInfo['iss']) && str_contains($userInfo['iss'], 'organizations')) {
            return 'business';
        }

        return 'personal';
    }

    /**
     * GET /api/auth/me
     * Get current user info and session status
     */
    public function getCurrentUser(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'is_admin' => $user->is_admin,
            ],
            'session' => [
                'expires_at' => $user->oauthSession?->session_expires_at,
            ],
        ]);
    }

    /**
     * POST /api/auth/logout
     * Logout and revoke tokens
     */
    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        // Get OAuth session
        $oauthSession = OAuthSession::where('user_id', $user->id)->latest()->first();

        if ($oauthSession) {
            // Revoke tokens with Microsoft
            $this->tokenService->revokeTokens($oauthSession);

            // Delete session
            $oauthSession->delete();
        }

        return response()->json(['success' => true, 'message' => 'Logged out']);
    }
}
