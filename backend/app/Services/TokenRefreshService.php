<?php

namespace App\Services;

use App\Models\ConnectedAccount;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\ClientException;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Handler\StreamHandler;
use GuzzleHttp\HandlerStack;
use Illuminate\Support\Facades\Log;

class TokenRefreshService
{
    private Client $httpClient;
    private GraphAPILogger $logger;
    private TokenEncryptionService $encryption;

    public function __construct(GraphAPILogger $logger = null, TokenEncryptionService $encryption = null)
    {
        $this->httpClient = new Client([
            'timeout' => 15,
            'handler' => HandlerStack::create(new StreamHandler()),
        ]);

        $this->logger = $logger ?? new GraphAPILogger();
        $this->encryption = $encryption ?? new TokenEncryptionService();
    }

    /**
     * Check if token needs refresh and refresh if necessary
     */
    public function ensureTokenValid(ConnectedAccount $account): bool
    {
        $this->logger->logTokenRefresh($account->id, 'check_token_validity', [
            'token_expires_at' => $account->token_expires_at?->toIso8601String(),
            'minutes_remaining' => $account->minutesUntilTokenExpires(),
        ]);

        // Check if token is expired
        if ($account->tokenIsExpired()) {
            $this->logger->logTokenRefresh($account->id, 'token_expired', [
                'expired_at' => $account->token_expires_at->toIso8601String(),
            ]);

            return $this->refreshToken($account);
        }

        // Check if token expires within 5 minutes, refresh proactively
        if ($account->minutesUntilTokenExpires() < 5) {
            $this->logger->logTokenRefresh($account->id, 'proactive_refresh', [
                'minutes_remaining' => $account->minutesUntilTokenExpires(),
                'refreshing_because' => 'token expires within 5 minutes',
            ]);

            return $this->refreshToken($account);
        }

        $this->logger->logTokenRefresh($account->id, 'token_valid', [
            'minutes_remaining' => $account->minutesUntilTokenExpires(),
        ]);

        return true;
    }

    /**
     * Refresh the access token using refresh_token
     */
    public function refreshToken(ConnectedAccount $account): bool
    {
        try {
            $this->logger->logTokenRefresh($account->id, 'refresh_started', [
                'connection_type' => $account->connection_type,
                'has_refresh_token' => !empty($account->refresh_token),
            ]);

            // Decrypt refresh token using TokenEncryptionService
            $refreshToken = $this->encryption->decrypt($account->refresh_token);

            if (empty($refreshToken)) {
                throw new \Exception('Refresh token is empty or could not be decrypted');
            }

            // Get OAuth credentials based on account type
            if ($account->connection_type === 'oauth_manual') {
                if (empty($account->oauth_client_id)) {
                    throw new \Exception('Missing OAuth client ID for manual account');
                }
                if (empty($account->oauth_client_secret)) {
                    throw new \Exception('Missing OAuth client secret for manual account');
                }

                $clientId = $account->oauth_client_id;
                $clientSecret = $this->encryption->decrypt($account->oauth_client_secret);
                $tenantId = $account->oauth_tenant_id ?? 'common';
            } else {
                // Use system-level credentials
                $clientId = config('microsoft.client_id');
                $clientSecret = config('microsoft.client_secret');
                $tenantId = config('microsoft.tenant_id', 'common');
            }

            // Build token request params
            $isPublicClient = config('microsoft.is_public_client', false);

            // Use the original scopes from the account, or fallback to .default
            $scopeString = 'https://graph.microsoft.com/.default';
            if (!empty($account->oauth_scopes)) {
                $decodedScopes = json_decode($account->oauth_scopes, true);
                if (is_array($decodedScopes)) {
                    $scopeString = implode(' ', $decodedScopes);
                }
            }
            
            
            $params = [
                'grant_type' => 'refresh_token',
                'client_id' => $clientId,
                'refresh_token' => $refreshToken,
                'scope' => $scopeString,
            ];
           
            
            // Only add client_secret if this is NOT a public client
            if (!$isPublicClient && !empty($clientSecret)) {
                $params['client_secret'] = $clientSecret;
            }

            // Debug: Log exact parameters being sent
            Log::debug('Token refresh parameters', [
                'account_id' => $account->id,
                'client_id' => $clientId,
                'is_public_client' => $isPublicClient,
                'has_client_secret' => !empty($clientSecret),
                'refresh_token_length' => strlen($refreshToken),
                'has_scope' => isset($params['scope']),
                'grant_type' => $params['grant_type'],
                'tenant_id' => $tenantId,
            ]);

            // Log the request (masked for security)
            $this->logger->logRequest(
                'POST',
                "https://login.microsoftonline.com/{$tenantId}/oauth2/v2.0/token",
                ['Content-Type' => 'application/x-www-form-urlencoded'],
                ['grant_type' => 'refresh_token', 'client_id' => $clientId, '***' => 'masked'],
                $account->id
            );

            // Use raw CURL like forward project does
            $startTime = microtime(true);
            $ch = curl_init("https://login.microsoftonline.com/{$tenantId}/oauth2/v2.0/token");
            $body = http_build_query($params);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/x-www-form-urlencoded',
                'Origin: ' . rtrim(config('app.url'), '/'),
            ]);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            Log::debug('Scope main body request: ', ["Body"=>$body]);
            // die();
            $responseStr = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            $duration = (microtime(true) - $startTime) * 1000;

            if ($curlError) {
                throw new \Exception("CURL Error: $curlError");
            }

            $responseBody = json_decode($responseStr, true);

            // DEBUG: Log raw token response for comparison
            Log::debug('Token Refresh - Raw Response from Microsoft', [
                'http_code' => $httpCode,
                'access_token_length' => strlen($responseBody['access_token'] ?? ''),
                'access_token_first_50' => substr($responseBody['access_token'] ?? '', 0, 50),
                'refresh_token_length' => strlen($responseBody['refresh_token'] ?? ''),
                'refresh_token_first_50' => substr($responseBody['refresh_token'] ?? '', 0, 50),
                'expires_in' => $responseBody['expires_in'] ?? null,
            ]);

            // Log the response
            Log::debug('Raw Response', $responseBody);
            $this->logger->logResponse(
                $httpCode,
                [],
                ['access_token' => '***masked***', 'expires_in' => $responseBody['expires_in'] ?? null],
                $account->id,
                $duration
            );

            // Debug: Log the full response if there's an error
            if ($httpCode >= 400) {
                Log::debug('Token refresh error response', [
                    'http_code' => $httpCode,
                    'error' => $responseBody['error'] ?? null,
                    'error_description' => $responseBody['error_description'] ?? null,
                ]);
            }

            if (!isset($responseBody['access_token'])) {
                throw new \Exception('Microsoft did not return an access_token');
            }

            // Calculate expiration times
            $expiresIn = (int) ($responseBody['expires_in'] ?? 3600);
            $tokenExpiresAt = now()->addSeconds($expiresIn);

            // 90 days is typical for refresh token lifetime
            $refreshTokenExpiresAt = now()->addDays(90);

            // Get new tokens from response (rolling token update)
            $newAccessToken = $responseBody['access_token'];
            $newRefreshToken = $responseBody['refresh_token'] ?? $refreshToken;

            // Check if refresh token rolled (changed)
            $oldRefreshTokenDecrypted = $this->encryption->decrypt($account->refresh_token);
            $refreshTokenRolled = ($newRefreshToken !== $oldRefreshTokenDecrypted);

            // Encrypt tokens using TokenEncryptionService
            $encryptedAccessToken = $this->encryption->encrypt($newAccessToken);
            $encryptedRefreshToken = $this->encryption->encrypt($newRefreshToken);

            // Log the token refresh with rolling token info
            Log::info('Token Refresh - Rolling Token Update', [
                'account_id' => $account->id,
                'email' => $account->email,
                'access_token_refreshed' => true,
                'refresh_token_rolled' => $refreshTokenRolled,
                'refresh_token_changed' => $refreshTokenRolled ? 'YES (new token from Microsoft)' : 'NO (reused old token)',
                'new_access_token_length' => strlen($newAccessToken),
                'new_refresh_token_length' => strlen($newRefreshToken),
                'token_expires_in_seconds' => $expiresIn,
                'token_expires_at' => $tokenExpiresAt->toIso8601String(),
                'refresh_token_expires_at' => $refreshTokenExpiresAt->toIso8601String(),
            ]);

            // Update account with new tokens
            $account->update([
                'access_token' => $encryptedAccessToken,
                'refresh_token' => $encryptedRefreshToken,
                'token_expires_at' => $tokenExpiresAt,
                'refresh_token_expires_at' => $refreshTokenExpiresAt,
                'refresh_failed_count' => 0,
                'last_refresh_attempt_at' => now(),
            ]);

            // Verify tokens were saved correctly
            $saved = $account->fresh();
            Log::info('Token Refresh - Saved and Verified', [
                'account_id' => $saved->id,
                'access_token_saved' => !empty($saved->access_token),
                'refresh_token_saved' => !empty($saved->refresh_token),
                'token_expires_at' => $saved->token_expires_at?->toIso8601String(),
                'refresh_token_expires_at' => $saved->refresh_token_expires_at?->toIso8601String(),
            ]);

            $this->logger->logTokenRefresh($account->id, 'refresh_successful', [
                'new_token_expires_at' => $tokenExpiresAt->toIso8601String(),
                'expires_in_seconds' => $expiresIn,
                'refresh_token_expires_at' => $refreshTokenExpiresAt->toIso8601String(),
            ]);

            Log::info("Token refreshed successfully for account {$account->id}", [
                'email' => $account->email,
                'expires_in' => $expiresIn,
            ]);

            return true;

        } catch (ClientException $e) {
            return $this->handleTokenRefreshError($account, $e);
        } catch (GuzzleException $e) {
            return $this->handleTokenRefreshError($account, $e);
        } catch (\Exception $e) {
            return $this->handleTokenRefreshError($account, $e);
        }
    }

    /**
     * Handle token refresh errors
     */
    private function handleTokenRefreshError(ConnectedAccount $account, \Throwable $exception): bool
    {
        $errorMessage = $exception->getMessage();

        // Extract error details if from Microsoft
        if ($exception instanceof ClientException) {
            $statusCode = $exception->getResponse()->getStatusCode();
            $body = json_decode((string) $exception->getResponse()->getBody(), true);

            if (isset($body['error'])) {
                $errorMessage = $body['error'] . ': ' . ($body['error_description'] ?? '');
            }

            $this->logger->logResponse(
                $statusCode,
                $exception->getResponse()->getHeaders(),
                $body ?? [],
                $account->id,
                0
            );
        }

        // Increment failure count
        $newFailureCount = $account->refresh_failed_count + 1;
        $account->update([
            'refresh_failed_count' => $newFailureCount,
            'last_refresh_attempt_at' => now(),
        ]);

        $this->logger->logTokenRefresh($account->id, 'refresh_failed', [
            'error' => $errorMessage,
            'failure_count' => $newFailureCount,
            'will_require_reconnect_at' => 3,
        ]);

        Log::warning("Token refresh failed for account {$account->id}: {$errorMessage}", [
            'email' => $account->email,
            'failure_count' => $newFailureCount,
        ]);

        // If failed 3 times in a row, disable the account
        if ($newFailureCount >= 3) {
            $this->logger->logTokenRefresh($account->id, 'account_disabled', [
                'reason' => 'too_many_refresh_failures',
                'requires_reconnect' => true,
            ]);

            Log::error("Account {$account->id} disabled after 3 refresh failures", [
                'email' => $account->email,
            ]);
        }

        return false;
    }

}
