<?php

namespace App\Services;

use App\Models\ConnectedAccount;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use Carbon\Carbon;

class ConnectedAccountTokenService
{
    private TokenEncryptionService $encryption;
    private TokenManagementService $tokenService;

    public function __construct(
        TokenEncryptionService $encryption = null,
        TokenManagementService $tokenService = null
    ) {
        $this->encryption = $encryption ?? new TokenEncryptionService();
        $this->tokenService = $tokenService ?? new TokenManagementService();
    }

    /**
     * Ensure OAuth access token is valid for a connected account
     * Auto-refreshes if expiring within 5 minutes
     */
    public function ensureAccessTokenValid(ConnectedAccount $account): ?string
    {
        // Check if re-auth is required
        if ($account->requires_reauth) {
            Log::warning("Account requires re-auth", [
                'account_id' => $account->id,
                'email' => $account->email,
            ]);
            return null;
        }

        // For SMTP accounts, no token refresh needed
        if ($account->connection_type === 'smtp') {
            return null; // SMTP doesn't use tokens
        }

        // Check if access token is expiring soon (within 5 minutes)
        if ($this->isTokenExpiringSoon($account->token_expires_at)) {
            return $this->refreshAccessToken($account);
        }

        // Return existing token
        return $this->encryption->decrypt($account->access_token);
    }

    /**
     * Refresh the access token using refresh token
     */
    public function refreshAccessToken(ConnectedAccount $account): ?string
    {
        try {
            // Check if refresh token is expired
            if ($account->refresh_token_expires_at &&
                $account->refresh_token_expires_at->isPast()) {

                Log::warning("Refresh token expired for account", [
                    'account_id' => $account->id,
                    'email' => $account->email,
                ]);

                $account->update([
                    'requires_reauth' => true,
                    'last_refresh_error' => 'Refresh token expired',
                    'refresh_failed_count' => $account->refresh_failed_count + 1,
                ]);

                return null;
            }

            $refreshToken = $this->encryption->decrypt($account->refresh_token);
            $clientId = $account->oauth_client_id ?? config('microsoft.client_id');
            $clientSecret = $account->encrypted_oauth_secret
                ? $this->encryption->decrypt($account->encrypted_oauth_secret)
                : config('microsoft.client_secret');

            $tokenResponse = $this->makeTokenRequest($clientId, $clientSecret, [
                'grant_type' => 'refresh_token',
                'refresh_token' => $refreshToken,
            ]);

            if (!$tokenResponse || !isset($tokenResponse['access_token'])) {
                throw new \Exception('Invalid token response from Microsoft');
            }

            // Decode ID token to get expiration info
            $expiresIn = $tokenResponse['expires_in'] ?? 3600;

            // Update account with new tokens
            $account->update([
                'access_token' => $this->encryption->encrypt($tokenResponse['access_token']),
                'refresh_token' => isset($tokenResponse['refresh_token'])
                    ? $this->encryption->encrypt($tokenResponse['refresh_token'])
                    : $account->refresh_token,
                'token_expires_at' => now()->addSeconds($expiresIn),
                'last_token_refresh' => now(),
                'refresh_failed_count' => 0,
                'last_refresh_error' => null,
                'requires_reauth' => false,
            ]);

            Log::info("Token refreshed for connected account", [
                'account_id' => $account->id,
                'email' => $account->email,
            ]);

            return $tokenResponse['access_token'];

        } catch (\Exception $e) {
            Log::error("Failed to refresh connected account token", [
                'account_id' => $account->id,
                'email' => $account->email,
                'error' => $e->getMessage(),
            ]);

            $account->update([
                'refresh_failed_count' => $account->refresh_failed_count + 1,
                'last_refresh_error' => $e->getMessage(),
            ]);

            // Mark for re-auth after 3 failures
            if ($account->refresh_failed_count >= 3) {
                $account->update(['requires_reauth' => true]);
            }

            return null;
        }
    }

    /**
     * Get SMTP credentials for an account
     */
    public function getSMTPCredentials(ConnectedAccount $account): ?array
    {
        if (!$account->smtp_credentials) {
            return null;
        }

        try {
            $credentials = json_decode(
                $this->encryption->decrypt($account->smtp_credentials),
                true
            );
            return $credentials;
        } catch (\Exception $e) {
            Log::error("Failed to decrypt SMTP credentials", [
                'account_id' => $account->id,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    /**
     * Store SMTP credentials encrypted
     */
    public function storeSMTPCredentials(ConnectedAccount $account, array $credentials): void
    {
        $encrypted = $this->encryption->encrypt(json_encode($credentials));
        $account->update(['smtp_credentials' => $encrypted]);
    }

    /**
     * Get authorization header for Graph API
     */
    public function getAuthorizationHeader(ConnectedAccount $account): ?string
    {
        $token = $this->ensureAccessTokenValid($account);
        return $token ? "Bearer {$token}" : null;
    }

    /**
     * Check if account needs re-authentication
     */
    public function requiresReauth(ConnectedAccount $account): bool
    {
        return (bool) $account->requires_reauth;
    }

    /**
     * Mark account for re-authentication
     */
    public function markRequiresReauth(ConnectedAccount $account, string $reason = null): void
    {
        $account->update([
            'requires_reauth' => true,
            'last_refresh_error' => $reason ?? 'Re-authentication required',
        ]);

        Log::warning("Account marked for re-auth", [
            'account_id' => $account->id,
            'email' => $account->email,
            'reason' => $reason,
        ]);
    }

    /**
     * Revoke tokens on logout
     */
    public function revokeTokens(ConnectedAccount $account): void
    {
        try {
            $token = $this->encryption->decrypt($account->access_token);
            $clientId = $account->oauth_client_id ?? config('microsoft.client_id');

            Http::post('https://login.microsoftonline.com/common/oauth2/v2.0/token', [
                'client_id' => $clientId,
                'token' => $token,
                'token_type_hint' => 'access_token',
            ]);

            Log::info("Tokens revoked for connected account", [
                'account_id' => $account->id,
                'email' => $account->email,
            ]);
        } catch (\Exception $e) {
            Log::warning("Failed to revoke tokens", [
                'account_id' => $account->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Check if token is expiring within N minutes
     */
    private function isTokenExpiringSoon(
        ?Carbon $expiresAt,
        int $minuteBuffer = 5
    ): bool {
        if (!$expiresAt) {
            return true; // No expiration info, refresh to be safe
        }

        return $expiresAt->diffInMinutes(now()) <= $minuteBuffer;
    }

    /**
     * Make HTTP request to Microsoft token endpoint
     */
    private function makeTokenRequest(
        string $clientId,
        string $clientSecret,
        array $data
    ): ?array {
        try {
            $response = Http::asForm()
                ->withBasicAuth($clientId, $clientSecret)
                ->timeout(30)
                ->post('https://login.microsoftonline.com/common/oauth2/v2.0/token', array_merge(
                    $data,
                    [
                        'client_id' => $clientId,
                    ]
                ));

            if ($response->successful()) {
                return $response->json();
            }

            $error = $response->json('error');
            Log::error("Microsoft token request failed", [
                'error' => $error,
                'details' => $response->json('error_description'),
            ]);

            return null;
        } catch (\Exception $e) {
            Log::error("Token request exception", [
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }
}
