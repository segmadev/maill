<?php

namespace App\Services;

use App\Models\ConnectedAccount;
use App\Models\OAuthAuthorizationState;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\StreamHandler;
use GuzzleHttp\HandlerStack;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;

/**
 * OAuth 2.0 Authorization Code Flow (Redirect-based)
 *
 * This is the "default" OAuth flow with browser redirect:
 * 1. Admin generates authorization URL with selected scopes
 * 2. User is redirected to Microsoft login
 * 3. User authorizes and is redirected back to callback
 * 4. Backend exchanges code for tokens
 * 5. Tokens stored in database
 *
 * Perfect for admin UI - user just clicks link and logs in normally
 */
class OAuthAuthorizationService
{
    private Client $httpClient;
    private TokenEncryptionService $encryption;
    private GraphAPILogger $logger;

    // Default OAuth scopes - can be customized per request
    private array $defaultScopes = [
        'Mail.Read',
        'Mail.Send',
        'Mail.ReadWrite',
        'offline_access',
    ];

    public function __construct(
        TokenEncryptionService $encryption,
        GraphAPILogger $logger = null
    ) {
        $this->encryption = $encryption;
        $this->logger = $logger ?? new GraphAPILogger();

        $this->httpClient = new Client([
            'timeout' => 15,
            'handler' => HandlerStack::create(new StreamHandler()),
            'http_errors' => false,
        ]);
    }

    /**
     * Step 1: Generate authorization URL for admin to share with user
     *
     * Admin clicks "Generate Authorization URL" button with optional scope customization
     * Backend generates the Microsoft login link
     * Admin shares link with user or user clicks it directly
     */
    public function generateAuthorizationUrl(
        int $userId,
        string $clientId,
        string $clientSecret,
        string $tenantId,
        string $email,
        array $customScopes = null
    ): array {
        $scopes = $customScopes ?? $this->defaultScopes;
        $state = Str::random(32);

        // Generate PKCE code_verifier and code_challenge
        $codeVerifier = $this->generatePKCECodeVerifier();
        $codeChallenge = $this->generatePKCECodeChallenge($codeVerifier);

        $this->logger->logTokenRefresh(0, 'oauth_authorize_url_generated', [
            'user_id' => $userId,
            'client_id' => $clientId,
            'tenant_id' => $tenantId,
            'scopes' => $scopes,
            'state' => $state,
            'pkce' => 'enabled',
        ]);

        // Store credentials in database with state so callback can retrieve them
        // This survives the redirect from Microsoft
        $this->trackAuthorizationState(
            $state,
            $userId,
            $clientId,
            $clientSecret,
            $tenantId,
            $email,
            $scopes,
            $codeVerifier
        );

        $baseUrl = rtrim(env('APP_URL', 'http://localhost:8765'), '/');
        $callbackUri = $baseUrl . '/api/auth/microsoft/oauth-callback';

        \Log::info('OAuth: generateAuthorizationUrl', [
            'app_url' => env('APP_URL'),
            'base_url' => $baseUrl,
            'callback_uri' => $callbackUri,
            'pkce_enabled' => true,
        ]);

        $params = [
            'client_id' => $clientId,
            'response_type' => 'code',
            'redirect_uri' => $callbackUri,
            'response_mode' => 'query',
            'scope' => implode(' ', $scopes),
            'state' => $state,
            'prompt' => 'select_account', // Let user choose which account
            'code_challenge' => $codeChallenge,
            'code_challenge_method' => 'S256',
        ];

        $url = "https://login.microsoftonline.com/{$tenantId}/oauth2/v2.0/authorize?"
            . http_build_query($params);

        return [
            'success' => true,
            'url' => $url,
            'state' => $state,
            'scopes' => $scopes,
            'expires_at' => now()->addMinutes(10), // State expires in 10 minutes
        ];
    }

    /**
     * Step 2: Handle callback from Microsoft
     *
     * Microsoft redirects here after user logs in
     * We exchange the authorization code for access tokens
     */
    public function handleCallback(
        string $state,
        string $code,
        string $clientId,
        string $clientSecret,
        string $tenantId
    ): array {
        // Verify state hasn't expired (10 minute timeout)
        $stateRecord = OAuthAuthorizationState::where('state', $state)->first();

        if (!$stateRecord) {
            $this->logger->logError(0, 'oauth_callback_state_not_found',
                new \Exception("State not found or expired: {$state}"));
            return [
                'success' => false,
                'error' => 'state_not_found',
                'message' => 'Authorization state not found or expired. Please start over.',
            ];
        }

        if (now()->isAfter($stateRecord->expires_at)) {
            $stateRecord->delete();
            $this->logger->logError(0, 'oauth_callback_state_expired',
                new \Exception("State expired at {$stateRecord->expires_at}"));
            return [
                'success' => false,
                'error' => 'state_expired',
                'message' => 'Authorization expired (10 minutes). Please start over.',
            ];
        }

        try {
            // Step 3: Exchange code for tokens
            // IMPORTANT: redirect_uri MUST match the one used when generating the authorization URL
            $baseUrl = rtrim(env('APP_URL', 'http://localhost:8765'), '/');
            $callbackUri = $baseUrl . '/api/auth/microsoft/oauth-callback';

            $this->logger->logTokenRefresh(0, 'oauth_token_exchange_start', [
                'client_id' => $clientId,
                'tenant_id' => $tenantId,
                'callback_uri' => $callbackUri,
            ]);

            $tokenParams = [
                'client_id' => $clientId,
                'code' => $code,
                'redirect_uri' => $callbackUri,
                'grant_type' => 'authorization_code',
                'scope' => implode(' ', $stateRecord->scopes ?? $this->defaultScopes),
            ];

            // Only send client_secret if NOT a public client
            // Public clients (SPA, mobile) don't have secrets and use PKCE instead
            if (!env('MICROSOFT_IS_PUBLIC_CLIENT', false)) {
                $tokenParams['client_secret'] = $clientSecret;
            }

            // Add PKCE code_verifier if present
            if (!empty($stateRecord->code_verifier)) {
                $tokenParams['code_verifier'] = $stateRecord->code_verifier;
            }

            \Log::info('OAuth: Exact token exchange parameters', [
                'client_id' => $clientId,
                'redirect_uri' => $callbackUri,
                'grant_type' => 'authorization_code',
                'scope' => $tokenParams['scope'],
                'has_code' => !empty($code),
                'has_secret' => !empty($clientSecret),
                'has_code_verifier' => !empty($tokenParams['code_verifier']),
            ]);

            // For Single-Page Application client type, Origin header is required
            $appUrl = rtrim(env('APP_URL', 'http://localhost:8765'), '/');

            $response = $this->httpClient->post(
                "https://login.microsoftonline.com/{$tenantId}/oauth2/v2.0/token",
                [
                    'form_params' => $tokenParams,
                    'headers' => [
                        'Origin' => $appUrl,
                        'Content-Type' => 'application/x-www-form-urlencoded',
                    ],
                ]
            );

            \Log::info("Raw Callback Response", ["Response"=>$response]);
            $data = json_decode((string) $response->getBody(), true);

            // DEBUG: Log RAW tokens from Microsoft callback
            \Log::info('OAuth: RAW TOKENS FROM MICROSOFT CALLBACK', [
                'access_token_full' => $data['access_token'] ?? null,
                'refresh_token_full' => $data['refresh_token'] ?? null,
                'access_token_length' => strlen($data['access_token'] ?? ''),
                'refresh_token_length' => strlen($data['refresh_token'] ?? ''),
                'access_token_first_100' => substr($data['access_token'] ?? '', 0, 100),
                'refresh_token_first_100' => substr($data['refresh_token'] ?? '', 0, 100),
                'expires_in' => $data['expires_in'] ?? null,
            ]);

            \Log::info('OAuth: Token exchange response', [
                'has_error' => !empty($data['error']),
                'error' => $data['error'] ?? null,
                'error_description' => $data['error_description'] ?? null,
                'has_access_token' => !empty($data['access_token']),
                'has_refresh_token' => !empty($data['refresh_token']),
                'expires_in' => $data['expires_in'] ?? null,
            ]);

            if (!empty($data['error'])) {
                $errorMsg = $data['error_description'] ?? $data['error'];
                \Log::error('OAuth: Token exchange error from Microsoft', [
                    'error' => $data['error'],
                    'description' => $errorMsg,
                ]);
                $this->logger->logError(0, 'oauth_callback_token_exchange',
                    new \Exception($errorMsg));
                return [
                    'success' => false,
                    'error' => $data['error'],
                    'message' => $errorMsg,
                ];
            }

            if (empty($data['access_token'])) {
                \Log::error('OAuth: No access token in response', ['response_keys' => array_keys($data)]);
                return [
                    'success' => false,
                    'error' => 'no_token',
                    'message' => 'Microsoft did not return access token',
                ];
            }

            // Extract email from ID token if available
            $email = $this->extractEmailFromIdToken($data['id_token'] ?? '');

            $this->logger->logTokenRefresh(0, 'oauth_callback_success', [
                'email' => $email,
                'expires_in' => $data['expires_in'],
                'has_refresh_token' => !empty($data['refresh_token']),
            ]);

            // Clean up state record
            $stateRecord->delete();

            return [
                'success' => true,
                'tokens' => $data,
                'email' => $email,
                'scopes' => $stateRecord->scopes ?? $this->defaultScopes,
            ];
        } catch (\Exception $e) {
            \Log::error('OAuth: Token exchange EXCEPTION', [
                'message' => $e->getMessage(),
                'code' => $e->getCode(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);

            $this->logger->logError(0, 'oauth_callback_exchange', $e);
            return [
                'success' => false,
                'error' => 'exchange_failed',
                'message' => 'Failed to exchange authorization code: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Step 4: Save tokens to database after successful callback
     */
    public function saveAccount(
        int $userId,
        string $email,
        array $tokens,
        string $clientId,
        string $clientSecret,
        string $tenantId,
        array $scopes = null,
        bool $isHybrid = false  // True if adding OAuth to existing SMTP account
    ): ConnectedAccount {
        $this->logger->logTokenRefresh($userId, 'oauth_authorize_save_account', [
            'email' => $email,
            'is_hybrid' => $isHybrid,
        ]);

        try {
            $existingAccount = ConnectedAccount::where('user_id', $userId)
                ->where('email', $email)
                ->first();

            // If hybrid mode: update existing SMTP account with OAuth credentials
            if ($isHybrid && $existingAccount && $existingAccount->connection_type === 'smtp') {
                \Log::info('OAuth: Adding OAuth credentials to existing SMTP account (hybrid mode)', [
                    'user_id' => $userId,
                    'email' => $email,
                    'account_id' => $existingAccount->id,
                ]);

                // Just update the OAuth fields, keep SMTP intact
                $encryptedAccessToken = $this->encryption->encrypt($tokens['access_token']);
                $encryptedRefreshToken = $this->encryption->encrypt($tokens['refresh_token'] ?? '');

                $existingAccount->update([
                    'access_token'         => $encryptedAccessToken,
                    'refresh_token'        => $encryptedRefreshToken,
                    'token_expires_at'     => now()->addSeconds((int) ($tokens['expires_in'] ?? 3600)),
                    'refresh_token_expires_at' => now()->addDays(90),
                    'oauth_client_id'      => $clientId,
                    'oauth_client_secret'  => $this->encryption->encrypt($clientSecret),
                    'oauth_tenant_id'      => $tenantId,
                    'oauth_scopes'         => $scopes ? json_encode($scopes) : null,
                ]);

                return $existingAccount;
            }

            // Normal mode: Delete existing accounts and create new one
            $existingAccounts = ConnectedAccount::where('user_id', $userId)
                ->where('email', $email)
                ->get();

            foreach ($existingAccounts as $existing) {
                \Log::info('OAuth: Deleting existing account before creating new one', [
                    'user_id' => $userId,
                    'email' => $email,
                    'connection_type' => $existing->connection_type,
                    'account_id' => $existing->id,
                ]);
                $existing->delete();
            }

            // Calculate expiration times
            $accessTokenExpiresAt = now()->addSeconds((int) ($tokens['expires_in'] ?? 3600));
            $refreshTokenExpiresAt = now()->addDays(90);

            // DEBUG: Log raw tokens BEFORE encryption
            \Log::info('OAuth: BEFORE ENCRYPTION - Raw tokens from callback', [
                'access_token_full' => $tokens['access_token'],
                'refresh_token_full' => $tokens['refresh_token'] ?? 'EMPTY',
                'access_token_length' => strlen($tokens['access_token'] ?? ''),
                'refresh_token_length' => strlen($tokens['refresh_token'] ?? ''),
                'access_token_first_100' => substr($tokens['access_token'] ?? '', 0, 100),
                'refresh_token_first_100' => substr($tokens['refresh_token'] ?? '', 0, 100),
            ]);

            // Encrypt tokens
            $encryptedAccessToken = $this->encryption->encrypt($tokens['access_token']);
            $encryptedRefreshToken = $this->encryption->encrypt($tokens['refresh_token'] ?? '');

            // DEBUG: Log encrypted tokens AFTER encryption
            \Log::info('OAuth: AFTER ENCRYPTION - Encrypted tokens', [
                'encrypted_access_token_full' => $encryptedAccessToken,
                'encrypted_refresh_token_full' => $encryptedRefreshToken,
                'encrypted_access_token_length' => strlen($encryptedAccessToken),
                'encrypted_refresh_token_length' => strlen($encryptedRefreshToken),
                'encrypted_access_token_first_100' => substr($encryptedAccessToken, 0, 100),
                'encrypted_refresh_token_first_100' => substr($encryptedRefreshToken, 0, 100),
            ]);

            // Create new account with encrypted tokens
            $account = ConnectedAccount::create([
                'user_id' => $userId,
                'email' => $email,
                'display_name' => $email, // Use email as display name

                // Encrypted tokens
                'access_token' => $encryptedAccessToken,
                'refresh_token' => $encryptedRefreshToken,

                // Expiration tracking
                'token_expires_at' => $accessTokenExpiresAt,
                'refresh_token_expires_at' => $refreshTokenExpiresAt,

                // OAuth Manual (same connection type)
                'connection_type' => 'oauth_manual',
                'oauth_client_id' => $clientId,
                'oauth_client_secret' => $this->encryption->encrypt($clientSecret),
                'oauth_tenant_id' => $tenantId,

                // Store selected scopes
                'oauth_scopes' => json_encode($scopes ?? $this->defaultScopes),

                // Initial state
                'is_primary' => false,
                'refresh_failed_count' => 0,
                'last_refresh_attempt_at' => now(),
            ]);

            // DEBUG: Log what was saved to the database
            \Log::info('OAuth: SAVED TO DATABASE - Account created', [
                'account_id' => $account->id,
                'email' => $account->email,
                'saved_access_token_full' => $account->access_token,
                'saved_refresh_token_full' => $account->refresh_token,
                'saved_access_token_length' => strlen($account->access_token),
                'saved_refresh_token_length' => strlen($account->refresh_token),
                'saved_access_token_first_100' => substr($account->access_token, 0, 100),
                'saved_refresh_token_first_100' => substr($account->refresh_token, 0, 100),
                'matches_encrypted' => [
                    'access_token_matches' => $account->access_token === $encryptedAccessToken,
                    'refresh_token_matches' => $account->refresh_token === $encryptedRefreshToken,
                ],
            ]);

            $this->logger->logTokenRefresh($account->id, 'oauth_authorize_account_saved', [
                'email' => $email,
                'token_expires_at' => $accessTokenExpiresAt->toIso8601String(),
                'scopes' => $scopes ?? $this->defaultScopes,
            ]);

            return $account;
        } catch (\Exception $e) {
            $this->logger->logError($userId, 'oauth_authorize_save_account', $e);
            throw $e;
        }
    }

    /**
     * Track authorization state during flow
     * State expires after 10 minutes if user doesn't complete flow
     */
    public function trackAuthorizationState(
        string $state,
        int $userId,
        string $clientId,
        string $clientSecret,
        string $tenantId,
        string $email,
        array $scopes = null,
        string $codeVerifier = null
    ): void {
        OAuthAuthorizationState::create([
            'state' => $state,
            'scopes' => $scopes ?? $this->defaultScopes,
            'expires_at' => now()->addMinutes(10),
            'user_id' => $userId,
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'tenant_id' => $tenantId,
            'email' => $email,
            'code_verifier' => $codeVerifier,
        ]);
    }

    /**
     * Generate PKCE code_verifier (RFC 7636)
     * Random string 43-128 characters long
     */
    private function generatePKCECodeVerifier(): string
    {
        $length = 128;
        $characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        $verifier = '';

        for ($i = 0; $i < $length; $i++) {
            $verifier .= $characters[rand(0, strlen($characters) - 1)];
        }

        return $verifier;
    }

    /**
     * Generate PKCE code_challenge from code_verifier
     * Using S256 method: BASE64URL(SHA256(code_verifier))
     */
    private function generatePKCECodeChallenge(string $codeVerifier): string
    {
        $hash = hash('sha256', $codeVerifier, true);
        return rtrim(strtr(base64_encode($hash), '+/', '-_'), '=');
    }

    /**
     * Get default scopes
     */
    public function getDefaultScopes(): array
    {
        return $this->defaultScopes;
    }

    /**
     * Extract email from Microsoft ID token
     */
    private function extractEmailFromIdToken(string $idToken): ?string
    {
        if (empty($idToken)) {
            return null;
        }

        try {
            $parts = explode('.', $idToken);
            if (count($parts) !== 3) {
                return null;
            }

            $payload = json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true);
            return $payload['preferred_username'] ?? $payload['email'] ?? null;
        } catch (\Exception) {
            return null;
        }
    }
}
