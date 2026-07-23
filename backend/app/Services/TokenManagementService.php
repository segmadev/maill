<?php

namespace App\Services;

use App\Models\OAuthSession;
use Illuminate\Support\Facades\Log;

class TokenManagementService
{
    private TokenEncryptionService $encryption;

    public function __construct(TokenEncryptionService $encryption = null)
    {
        $this->encryption = $encryption ?? new TokenEncryptionService();
    }

    /**
     * Refresh access token if needed
     * Returns true if token is valid (either was already valid or refresh succeeded)
     * Returns false if refresh failed
     */
    public function ensureAccessTokenValid(OAuthSession $session): bool
    {
        // Check if token expires soon (within 5 minutes)
        if (!$session->accessTokenExpiresSoon(5)) {
            // Token is still valid, no need to refresh
            return true;
        }

        // Check if refresh token is expired
        if ($session->isRefreshTokenExpired()) {
            $session->markRequiresReauth('Refresh token has expired');
            Log::warning("Refresh token expired for session {$session->id}", [
                'user_id' => $session->user_id,
                'account_id' => $session->account_id,
            ]);
            return false;
        }

        // Attempt to refresh
        return $this->refreshAccessToken($session);
    }

    /**
     * Refresh the access token using refresh token
     */
    public function refreshAccessToken(OAuthSession $session): bool
    {
        try {
            $refreshToken = $this->encryption->decrypt($session->microsoft_refresh_token);

            if (empty($refreshToken)) {
                $session->markRequiresReauth('Could not decrypt refresh token');
                return false;
            }

            // Get OAuth credentials
            $credentials = $this->getOAuthCredentials($session);

            // Build request
            $params = [
                'grant_type' => 'refresh_token',
                'client_id' => $credentials['client_id'],
                'refresh_token' => $refreshToken,
                'scope' => 'https://graph.microsoft.com/.default offline_access',
            ];

            // Only add client_secret if not a public client
            if (!empty($credentials['client_secret'])) {
                $params['client_secret'] = $credentials['client_secret'];
            }

            // Make request to Microsoft
            $response = $this->makeTokenRequest(
                $credentials['tenant_id'],
                $params
            );

            if ($response['error']) {
                throw new \Exception($response['error'] . ': ' . ($response['error_description'] ?? ''));
            }

            // Extract tokens
            $accessToken = $response['access_token'];
            $newRefreshToken = $response['refresh_token'] ?? $refreshToken;
            $expiresIn = (int)($response['expires_in'] ?? 3600);

            // Update session with new tokens
            $session->update([
                'microsoft_access_token' => $this->encryption->encrypt($accessToken),
                'microsoft_refresh_token' => $this->encryption->encrypt($newRefreshToken),
                'token_expires_at' => now()->addSeconds($expiresIn),
                'last_refreshed_at' => now(),
                'refresh_failed_count' => 0,
                'last_refresh_error' => null,
                'requires_reauth' => false,
            ]);

            Log::info("Token refreshed for session {$session->id}", [
                'user_id' => $session->user_id,
                'account_id' => $session->account_id,
                'expires_in' => $expiresIn,
            ]);

            return true;
        } catch (\Exception $e) {
            return $this->handleRefreshError($session, $e);
        }
    }

    /**
     * Get OAuth credentials for the session
     */
    private function getOAuthCredentials(OAuthSession $session): array
    {
        // If session has associated account with manual credentials, use those
        if ($session->account_id && $session->account) {
            return [
                'client_id' => $session->account->oauth_client_id,
                'client_secret' => $this->encryption->decrypt($session->account->oauth_client_secret),
                'tenant_id' => $session->account->oauth_tenant_id ?? $session->tenant_id ?? 'common',
            ];
        }

        // Otherwise use system credentials
        return [
            'client_id' => config('microsoft.client_id'),
            'client_secret' => config('microsoft.client_secret'),
            'tenant_id' => $session->tenant_id ?? config('microsoft.tenant_id', 'common'),
        ];
    }

    /**
     * Make token request to Microsoft
     */
    private function makeTokenRequest(string $tenantId, array $params): array
    {
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
     * Handle token refresh error
     */
    private function handleRefreshError(OAuthSession $session, \Throwable $error): bool
    {
        $errorMessage = $error->getMessage();
        $newFailureCount = ($session->refresh_failed_count ?? 0) + 1;

        $session->update([
            'refresh_failed_count' => $newFailureCount,
            'last_refresh_error' => $errorMessage,
        ]);

        // If it's an invalid_grant error, mark as requiring reauth
        if (str_contains($errorMessage, 'invalid_grant') || str_contains($errorMessage, 'AADSTS700084')) {
            $session->markRequiresReauth($errorMessage);
        }

        // If too many failures, mark as requiring reauth
        if ($newFailureCount >= 3) {
            $session->markRequiresReauth("Failed to refresh token {$newFailureCount} times");
        }

        Log::warning("Token refresh failed for session {$session->id}", [
            'user_id' => $session->user_id,
            'account_id' => $session->account_id,
            'error' => $errorMessage,
            'failure_count' => $newFailureCount,
        ]);

        return false;
    }

    /**
     * Get decrypted access token
     */
    public function getAccessToken(OAuthSession $session): ?string
    {
        if (!$session->microsoft_access_token) {
            return null;
        }

        try {
            return $this->encryption->decrypt($session->microsoft_access_token);
        } catch (\Exception $e) {
            Log::error("Failed to decrypt access token for session {$session->id}", [
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    /**
     * Revoke tokens with Microsoft
     */
    public function revokeTokens(OAuthSession $session): bool
    {
        try {
            $refreshToken = $this->encryption->decrypt($session->microsoft_refresh_token);

            if (!$refreshToken) {
                return true;
            }

            $credentials = $this->getOAuthCredentials($session);
            $tenantId = $credentials['tenant_id'];

            $params = [
                'client_id' => $credentials['client_id'],
                'token' => $refreshToken,
            ];

            if (!empty($credentials['client_secret'])) {
                $params['client_secret'] = $credentials['client_secret'];
            }

            $ch = curl_init("https://login.microsoftonline.com/{$tenantId}/oauth2/v2.0/revoke");
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/x-www-form-urlencoded',
            ]);
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);

            curl_exec($ch);
            curl_close($ch);

            return true;
        } catch (\Exception $e) {
            Log::warning("Failed to revoke tokens for session {$session->id}", [
                'error' => $e->getMessage(),
            ]);
            return false;
        }
    }
}
