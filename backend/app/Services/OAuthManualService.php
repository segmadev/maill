<?php

namespace App\Services;

use App\Models\ConnectedAccount;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\ClientException;
use GuzzleHttp\Handler\StreamHandler;
use GuzzleHttp\HandlerStack;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Session;

/**
 * OAuth 2.0 Manual Device Code Flow for OAuth Manual Accounts
 *
 * This service implements the device code flow as described in the OAuth guide:
 * 1. Admin initiates device code request (user sees code and verifies on Microsoft)
 * 2. Admin polls for completion
 * 3. Exchange device code for tokens
 * 4. Store tokens securely in database
 * 5. Handle token refresh using TokenRefreshService
 *
 * KEY PRINCIPLES:
 * - Refresh tokens stored ONLY on backend
 * - Access tokens also stored on backend
 * - Frontend never sees refresh tokens
 * - Tokens tracked with expiration times
 * - Automatic refresh before expiration
 */
class OAuthManualService
{
    private Client $httpClient;
    private TokenEncryptionService $encryption;
    private GraphAPILogger $logger;

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
     * Step 1: Initiate device code flow
     *
     * Admin requests a device code. Microsoft returns:
     * - user_code: User shows this on Microsoft's auth page
     * - device_code: Admin uses this to poll for completion
     * - verification_uri: URL user goes to
     */
    public function initiateDeviceCodeFlow(
        string $clientId,
        string $clientSecret,
        string $tenantId
    ): array {
        $this->logger->logTokenRefresh(0, 'oauth_manual_device_code_start', [
            'client_id' => $clientId,
            'tenant_id' => $tenantId,
        ]);

        try {
            // Step 1: Request device code from Microsoft
            $response = $this->httpClient->post(
                "https://login.microsoftonline.com/{$tenantId}/oauth2/v2.0/devicecode",
                [
                    'form_params' => [
                        'client_id' => $clientId,
                        'client_secret' => $clientSecret,
                        'scope' => 'Mail.Read Mail.Send Mail.ReadWrite offline_access',
                    ],
                ]
            );

            $data = json_decode((string) $response->getBody(), true);

            if (!empty($data['error'])) {
                throw new \Exception($data['error_description'] ?? $data['error']);
            }

            if (empty($data['device_code']) || empty($data['user_code'])) {
                throw new \Exception('Microsoft returned invalid device code response');
            }

            // Step 2: Store device code in session for polling
            // This is TEMPORARY data that expires in ~15 minutes
            Session::put('oauth_manual_device_code', $data['device_code']);
            Session::put('oauth_manual_client_id', $clientId);
            Session::put('oauth_manual_client_secret', $clientSecret);
            Session::put('oauth_manual_tenant_id', $tenantId);
            Session::put('oauth_manual_device_code_expires_at', now()->addSeconds($data['expires_in']));

            $this->logger->logTokenRefresh(0, 'oauth_manual_device_code_initiated', [
                'user_code' => $data['user_code'],
                'expires_in' => $data['expires_in'],
                'interval' => $data['interval'],
            ]);

            return [
                'success' => true,
                'user_code' => $data['user_code'],
                'device_code' => $data['device_code'],
                'verification_uri' => $data['verification_uri'],
                'expires_in' => $data['expires_in'],
                'interval' => $data['interval'],
                'message' => $data['message'] ?? '',
            ];
        } catch (\Exception $e) {
            $this->logger->logError(0, 'oauth_manual_device_code_start', $e);
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Step 2: Poll for device code completion
     *
     * Admin keeps polling while user signs in on Microsoft.
     * Once user authorizes, Microsoft returns the tokens.
     */
    public function pollDeviceCodeFlow(): array {
        // Retrieve credentials from session
        $deviceCode = Session::get('oauth_manual_device_code');
        $clientId = Session::get('oauth_manual_client_id');
        $clientSecret = Session::get('oauth_manual_client_secret');
        $tenantId = Session::get('oauth_manual_tenant_id');
        $expiresAt = Session::get('oauth_manual_device_code_expires_at');

        if (!$deviceCode) {
            return [
                'status' => 'error',
                'message' => 'No device code in session. Start a new device code flow.',
            ];
        }

        // Check if device code expired
        if (now()->isAfter($expiresAt)) {
            Session::forget(['oauth_manual_device_code', 'oauth_manual_client_id', 'oauth_manual_client_secret', 'oauth_manual_tenant_id', 'oauth_manual_device_code_expires_at']);
            return [
                'status' => 'expired',
                'message' => 'Device code expired. Please start a new authentication.',
            ];
        }

        try {
            // Step 3: Poll Microsoft for tokens
            $response = $this->httpClient->post(
                "https://login.microsoftonline.com/{$tenantId}/oauth2/v2.0/token",
                [
                    'form_params' => [
                        'grant_type' => 'urn:ietf:params:oauth:grant-type:device_code',
                        'client_id' => $clientId,
                        'client_secret' => $clientSecret,  // MUST send for confidential client
                        'device_code' => $deviceCode,
                    ],
                ]
            );

            $data = json_decode((string) $response->getBody(), true);

            // User hasn't authorized yet
            if ($data['error'] === 'authorization_pending') {
                return [
                    'status' => 'pending',
                    'message' => 'Waiting for user to complete authentication...',
                ];
            }

            // Slow down: wait longer between polls
            if ($data['error'] === 'slow_down') {
                return [
                    'status' => 'slow_down',
                    'message' => 'Polling too fast. Please wait a few seconds.',
                ];
            }

            // User denied access
            if ($data['error'] === 'access_denied') {
                Session::forget(['oauth_manual_device_code', 'oauth_manual_client_id', 'oauth_manual_client_secret', 'oauth_manual_tenant_id', 'oauth_manual_device_code_expires_at']);
                return [
                    'status' => 'denied',
                    'message' => 'User denied access to the application.',
                ];
            }

            // Other Microsoft errors
            if (!empty($data['error'])) {
                $this->logger->logError(0, 'oauth_manual_poll', new \Exception($data['error_description'] ?? $data['error']));
                return [
                    'status' => 'error',
                    'message' => $data['error_description'] ?? $data['error'],
                ];
            }

            // No tokens returned
            if (empty($data['access_token'])) {
                return [
                    'status' => 'error',
                    'message' => 'Microsoft did not return access token.',
                ];
            }

            // Clear session data - we got tokens!
            Session::forget(['oauth_manual_device_code', 'oauth_manual_client_id', 'oauth_manual_client_secret', 'oauth_manual_tenant_id', 'oauth_manual_device_code_expires_at']);

            $this->logger->logTokenRefresh(0, 'oauth_manual_tokens_received', [
                'expires_in' => $data['expires_in'],
                'has_refresh_token' => !empty($data['refresh_token']),
            ]);

            return [
                'status' => 'authorized',
                'tokens' => $data,
            ];
        } catch (\Exception $e) {
            $this->logger->logError(0, 'oauth_manual_poll', $e);
            return [
                'status' => 'error',
                'message' => 'Failed to poll Microsoft: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Step 3: Save tokens to database
     *
     * After successful poll, create/update the connected account with tokens.
     * Encrypt tokens before storing.
     */
    public function saveAccount(
        int $userId,
        string $email,
        string $displayName,
        array $tokens,
        string $clientId,
        string $clientSecret,
        string $tenantId
    ): ConnectedAccount {
        $this->logger->logTokenRefresh($userId, 'oauth_manual_save_account', [
            'email' => $email,
        ]);

        Log::info("Token", ["Token"=>$tokens]);
        try {
            // Delete any existing account with this email
            $existing = ConnectedAccount::where('email', $email)->first();
            if ($existing) {
                $existing->delete();
            }

            // Calculate token expiration times
            $accessTokenExpiresAt = now()->addSeconds((int) ($tokens['expires_in'] ?? 3600));
            $refreshTokenExpiresAt = now()->addDays(90); // Microsoft's typical refresh token lifetime

            // Create new account with encrypted tokens
            $account = ConnectedAccount::create([
                'user_id' => $userId,
                'email' => $email,
                'display_name' => $displayName,

                // Encrypted tokens - NEVER stored unencrypted
                'access_token' => $this->encryption->encrypt($tokens['access_token']),
                'refresh_token' => $this->encryption->encrypt($tokens['refresh_token'] ?? ''),

                // Token expiration tracking
                'token_expires_at' => $accessTokenExpiresAt,
                'refresh_token_expires_at' => $refreshTokenExpiresAt,

                // OAuth Manual specific
                'connection_type' => 'oauth_manual',
                'oauth_client_id' => $clientId,
                'oauth_client_secret' => $this->encryption->encrypt($clientSecret),
                'oauth_tenant_id' => $tenantId,

                // Initial state
                'is_primary' => false,
                'refresh_failed_count' => 0,
                'last_refresh_attempt_at' => now(),
            ]);

            $this->logger->logTokenRefresh($account->id, 'oauth_manual_account_saved', [
                'email' => $email,
                'token_expires_at' => $accessTokenExpiresAt->toIso8601String(),
                'refresh_token_expires_at' => $refreshTokenExpiresAt->toIso8601String(),
            ]);

            Log::info("OAuth Manual account created: {$email}", [
                'user_id' => $userId,
                'account_id' => $account->id,
                'token_expires_at' => $accessTokenExpiresAt->toIso8601String(),
            ]);

            return $account;
        } catch (\Exception $e) {
            $this->logger->logError($userId, 'oauth_manual_save_account', $e);
            throw $e;
        }
    }

    /**
     * Verify the OAuth Manual account can still refresh tokens
     *
     * Called before making Graph API calls to ensure we have valid tokens.
     */
    public function ensureTokenValid(ConnectedAccount $account): bool {
        if ($account->connection_type !== 'oauth_manual') {
            return false;
        }

        $tokenRefreshService = app(TokenRefreshService::class);
        return $tokenRefreshService->ensureTokenValid($account);
    }
}
