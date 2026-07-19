<?php

namespace App\Services;

use App\Models\ConnectedAccount;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class TokenRefreshDiagnostics
{
    private TokenEncryptionService $encryption;

    public function __construct(TokenEncryptionService $encryption = null)
    {
        $this->encryption = $encryption ?? new TokenEncryptionService();
    }

    /**
     * Get comprehensive token health diagnostics for an account
     */
    public function getDiagnostics(int $accountId): array
    {
        $account = ConnectedAccount::find($accountId);

        if (!$account) {
            return ['error' => 'Account not found'];
        }

        return [
            'account' => [
                'id' => $account->id,
                'email' => $account->email,
                'connection_type' => $account->connection_type,
            ],
            'tokens' => $this->getTokenStatus($account),
            'oauth_config' => $this->getOAuthConfig($account),
            'scopes' => $this->getScopes($account),
            'history' => $this->getTokenHistory($accountId),
            'issues' => $this->diagnoseIssues($account),
            'recommendations' => $this->getRecommendations($account),
        ];
    }

    /**
     * Check token status and validate with provider
     */
    private function getTokenStatus(ConnectedAccount $account): array
    {
        $now = now();

        // Validate token with provider (quickly check if token is still valid)
        $tokenValid = $this->validateTokenWithProvider($account);

        return [
            'access_token' => [
                'has_value' => !empty($account->access_token),
                'encrypted' => !empty($account->access_token) ? 'yes' : 'no',
                'expires_at' => $account->token_expires_at?->toIso8601String(),
                'is_expired' => $account->tokenIsExpired(),
                'minutes_until_expiry' => $account->minutesUntilTokenExpires(),
                'provider_valid' => $tokenValid['valid'],
                'validation_error' => $tokenValid['error'] ?? null,
            ],
            'refresh_token' => [
                'has_value' => !empty($account->refresh_token),
                'encrypted' => !empty($account->refresh_token) ? 'yes' : 'no',
                'expires_at' => $account->refresh_token_expires_at?->toIso8601String(),
                'is_expired' => $account->refreshTokenIsExpired(),
                'days_until_expiry' => $this->getDaysUntilExpiry($account->refresh_token_expires_at),
            ],
            'last_refresh' => $account->last_token_refresh_at?->toIso8601String() ?? 'Never',
            'refresh_failed_count' => $account->refresh_failed_count ?? 0,
        ];
    }

    /**
     * Get OAuth configuration
     */
    private function getOAuthConfig(ConnectedAccount $account): array
    {
        $config = [
            'client_id' => [
                'has_value' => !empty($account->oauth_client_id),
                'value_preview' => $account->oauth_client_id
                    ? substr($account->oauth_client_id, 0, 8) . '...'
                    : 'missing',
            ],
            'client_secret' => [
                'has_value' => !empty($account->oauth_client_secret),
                'can_decrypt' => $this->canDecryptSecret($account),
            ],
            'tenant_id' => $account->oauth_tenant_id ?? 'common (default)',
        ];

        // For non-manual accounts, check system config
        if ($account->connection_type !== 'oauth_manual') {
            $config['system_client_id'] = [
                'has_value' => !empty(config('microsoft.client_id')),
                'value_preview' => config('microsoft.client_id')
                    ? substr(config('microsoft.client_id'), 0, 8) . '...'
                    : 'missing',
            ];
            $config['is_public_client'] = config('microsoft.is_public_client', false);
        }

        return $config;
    }

    /**
     * Get scopes
     */
    private function getScopes(ConnectedAccount $account): array
    {
        $stored = [];
        if (!empty($account->oauth_scopes)) {
            $stored = json_decode($account->oauth_scopes, true) ?? [];
        }

        $recommended = ['Mail.Read', 'Mail.Send', 'offline_access'];
        $hasOfflineAccess = in_array('offline_access', $stored);

        return [
            'stored_scopes' => $stored,
            'has_offline_access' => $hasOfflineAccess,
            'offline_access_critical' => $hasOfflineAccess ? '✓ GOOD' : '✗ MISSING (critical!)',
            'recommended_scopes' => $recommended,
            'missing_scopes' => array_diff($recommended, $stored),
        ];
    }

    /**
     * Get token update history
     */
    private function getTokenHistory(int $accountId): array
    {
        // This would need a token_history table, but we can provide logs instead
        $history = DB::table('activity_log')
            ->where('subject_id', $accountId)
            ->where('description', 'like', '%token%')
            ->orderBy('created_at', 'desc')
            ->limit(10)
            ->get(['description', 'created_at'])
            ->toArray();

        if (empty($history)) {
            return ['note' => 'No token history tracked yet'];
        }

        return array_map(fn ($item) => [
            'event' => $item->description,
            'timestamp' => $item->created_at,
        ], $history);
    }

    /**
     * Diagnose issues
     */
    private function diagnoseIssues(ConnectedAccount $account): array
    {
        $issues = [];

        // Access token issues
        if (empty($account->access_token)) {
            $issues[] = [
                'severity' => 'critical',
                'issue' => 'No access token stored',
                'cause' => 'Never authenticated or token was cleared',
                'fix' => 'Reconnect the account via OAuth flow',
            ];
        } elseif ($account->tokenIsExpired()) {
            $issues[] = [
                'severity' => 'high',
                'issue' => 'Access token expired',
                'cause' => 'Token not refreshed before expiry',
                'fix' => 'Refresh token will be used next request',
            ];
        } else {
            // Token not locally expired, but check if provider still accepts it
            $validation = $this->validateTokenWithProvider($account);
            if (!$validation['valid']) {
                $issues[] = [
                    'severity' => 'critical',
                    'issue' => 'Access token rejected by provider',
                    'cause' => $validation['error'] ?? 'Token invalid or revoked',
                    'fix' => 'Try refreshing or reconnect the account',
                ];
            }
        }

        // Refresh token issues
        if (empty($account->refresh_token)) {
            $issues[] = [
                'severity' => 'critical',
                'issue' => 'No refresh token stored',
                'cause' => 'Never authenticated or offline_access scope missing',
                'fix' => 'Reconnect with offline_access scope',
            ];
        } elseif ($account->refreshTokenIsExpired()) {
            $issues[] = [
                'severity' => 'critical',
                'issue' => 'Refresh token expired',
                'cause' => 'Token lifetime exceeded or revoked',
                'fix' => 'Must reconnect - refresh token cannot be renewed',
            ];
        }

        // OAuth config issues
        if ($account->connection_type === 'oauth_manual') {
            if (empty($account->oauth_client_id)) {
                $issues[] = [
                    'severity' => 'critical',
                    'issue' => 'OAuth client ID missing',
                    'cause' => 'Account setup incomplete',
                    'fix' => 'Provide valid Azure app credentials',
                ];
            }
            if (empty($account->oauth_client_secret)) {
                $issues[] = [
                    'severity' => 'critical',
                    'issue' => 'OAuth client secret missing',
                    'cause' => 'Account setup incomplete',
                    'fix' => 'Provide valid Azure app credentials',
                ];
            }
        }

        // Scope issues
        $scopes = json_decode($account->oauth_scopes ?? '[]', true) ?? [];
        if (!in_array('offline_access', $scopes)) {
            $issues[] = [
                'severity' => 'critical',
                'issue' => 'Missing offline_access scope',
                'cause' => 'Cannot get long-lived refresh token',
                'fix' => 'Reconnect with offline_access scope included',
            ];
        }

        // Refresh failure issues
        if (($account->refresh_failed_count ?? 0) >= 3) {
            $issues[] = [
                'severity' => 'critical',
                'issue' => 'Too many refresh failures',
                'cause' => 'Invalid/revoked refresh token or policy changes',
                'fix' => 'Reconnect the account',
            ];
        }

        return empty($issues) ? ['status' => 'No issues detected'] : $issues;
    }

    /**
     * Get recommendations
     */
    private function getRecommendations(ConnectedAccount $account): array
    {
        $recommendations = [];

        // Check if immediate action needed
        if ($account->refreshTokenIsExpired() || ($account->refresh_failed_count ?? 0) >= 3) {
            $recommendations[] = [
                'priority' => 'urgent',
                'action' => 'Reconnect this account immediately',
                'reason' => 'Refresh token expired or revoked - authentication required',
            ];
        }

        // Check scope
        $scopes = json_decode($account->oauth_scopes ?? '[]', true) ?? [];
        if (!in_array('offline_access', $scopes)) {
            $recommendations[] = [
                'priority' => 'high',
                'action' => 'Reconnect with offline_access scope',
                'reason' => 'Current scope does not include long-lived refresh token',
            ];
        }

        // Check if token about to expire
        if ($account->minutesUntilTokenExpires() < 10) {
            $recommendations[] = [
                'priority' => 'high',
                'action' => 'Refresh token immediately',
                'reason' => 'Access token expiring soon',
            ];
        }

        // Check if haven't refreshed in a while
        if ($account->last_token_refresh_at && $account->last_token_refresh_at->diffInHours(now()) > 24) {
            $recommendations[] = [
                'priority' => 'medium',
                'action' => 'Proactively refresh token',
                'reason' => 'No refresh in last 24 hours - ensure rolling token is up-to-date',
            ];
        }

        if (empty($recommendations)) {
            $recommendations[] = [
                'priority' => 'info',
                'action' => 'Token is healthy',
                'reason' => 'Continue normal operations',
            ];
        }

        return $recommendations;
    }

    private function canDecryptSecret(ConnectedAccount $account): bool
    {
        try {
            if (empty($account->oauth_client_secret)) {
                return false;
            }
            $this->encryption->decrypt($account->oauth_client_secret);
            return true;
        } catch (\Exception $e) {
            return false;
        }
    }

    private function getDaysUntilExpiry($expiryDate): ?int
    {
        if (!$expiryDate) {
            return null;
        }
        $days = $expiryDate->diffInDays(now());
        return $days < 0 ? -1 : $days;
    }

    /**
     * Validate token with provider by attempting a simple API call
     */
    private function validateTokenWithProvider(ConnectedAccount $account): array
    {
        if (empty($account->access_token)) {
            return ['valid' => false, 'error' => 'No access token stored'];
        }

        try {
            $token = $this->encryption->decrypt($account->access_token);

            if (empty($token)) {
                return ['valid' => false, 'error' => 'Could not decrypt access token'];
            }

            // Quick test: Try to get user profile from Microsoft Graph
            $ch = curl_init('https://graph.microsoft.com/v1.0/me');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 5);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                "Authorization: Bearer {$token}",
                'Content-Type: application/json',
            ]);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            if ($curlError) {
                return ['valid' => false, 'error' => "Connection error: {$curlError}"];
            }

            if ($httpCode === 200) {
                return ['valid' => true];
            }

            $responseBody = json_decode($response, true);
            if ($httpCode === 401) {
                return [
                    'valid' => false,
                    'error' => $responseBody['error']['message'] ?? 'Token rejected by provider (401 Unauthorized)',
                ];
            }

            if ($httpCode >= 400) {
                return [
                    'valid' => false,
                    'error' => $responseBody['error']['message'] ?? "Provider returned HTTP {$httpCode}",
                ];
            }

            return ['valid' => true];
        } catch (\Exception $e) {
            return ['valid' => false, 'error' => $e->getMessage()];
        }
    }
}
