<?php

namespace App\Services;

use App\Models\User;
use App\Models\OAuthSession;
use App\Models\ConnectedAccount;
use Illuminate\Support\Facades\Log;

/**
 * Handles migration from old OAuth system to BFF OAuth
 * Supports both JWT tokens and manual OAuth credentials
 */
class OAuthMigrationService
{
    private TokenEncryptionService $encryption;

    public function __construct(TokenEncryptionService $encryption = null)
    {
        $this->encryption = $encryption ?? new TokenEncryptionService();
    }

    /**
     * Migrate a user's JWT session to BFF OAuth session
     * (For users transitioning from JWT authentication)
     */
    public function migrateJwtUserToBFF(User $user): ?OAuthSession
    {
        try {
            // Find user's primary connected account (with OAuth)
            $account = $user->connectedAccounts()
                ->where('connection_type', 'oauth_manual')
                ->orWhere('connection_type', 'office365')
                ->first();

            if (!$account || !$account->refresh_token) {
                Log::warning("Cannot migrate user to BFF: no OAuth account found", [
                    'user_id' => $user->id,
                ]);
                return null;
            }

            // Check if refresh token is still valid
            if ($account->refreshTokenIsExpired()) {
                Log::info("User's refresh token expired, will require re-auth", [
                    'user_id' => $user->id,
                    'account_id' => $account->id,
                ]);
                // Mark for re-auth later
                return $this->createRequiresReauthSession($user, $account);
            }

            // Create BFF OAuth session from existing account
            $session = OAuthSession::create([
                'user_id' => $user->id,
                'account_id' => $account->id,
                'microsoft_access_token' => $account->access_token, // Already encrypted
                'microsoft_refresh_token' => $account->refresh_token, // Already encrypted
                'token_expires_at' => $account->token_expires_at,
                'refresh_token_expires_at' => $account->refresh_token_expires_at,
                'account_type' => 'business', // Assuming business, can be refined
                'tenant_id' => $account->oauth_tenant_id ?? 'common',
                'microsoft_email' => $account->email,
                'microsoft_user_id' => null,
                'session_token' => \Illuminate\Support\Str::random(64),
                'session_expires_at' => now()->addDays(30),
                'last_activity_at' => now(),
            ]);

            Log::info("Migrated JWT user to BFF OAuth session", [
                'user_id' => $user->id,
                'account_id' => $account->id,
                'session_id' => $session->id,
            ]);

            return $session;
        } catch (\Exception $e) {
            Log::error("Failed to migrate JWT user to BFF", [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    /**
     * Migrate a connected account's tokens to BFF OAuth session
     * (For accounts that already have valid tokens)
     */
    public function migrateAccountToBFF(ConnectedAccount $account): ?OAuthSession
    {
        try {
            if (!$account->user) {
                return null;
            }

            // Check if token is expired
            if ($account->refreshTokenIsExpired()) {
                Log::info("Account's refresh token expired, marking for re-auth", [
                    'account_id' => $account->id,
                    'user_id' => $account->user_id,
                ]);
                return $this->createRequiresReauthSession($account->user, $account);
            }

            // Create BFF session
            $session = OAuthSession::create([
                'user_id' => $account->user_id,
                'account_id' => $account->id,
                'microsoft_access_token' => $account->access_token,
                'microsoft_refresh_token' => $account->refresh_token,
                'token_expires_at' => $account->token_expires_at,
                'refresh_token_expires_at' => $account->refresh_token_expires_at,
                'account_type' => $account->connection_type === 'office365' ? 'business' : 'personal',
                'tenant_id' => $account->oauth_tenant_id ?? 'common',
                'microsoft_email' => $account->email,
                'microsoft_user_id' => null,
                'session_token' => \Illuminate\Support\Str::random(64),
                'session_expires_at' => now()->addDays(30),
                'last_activity_at' => now(),
            ]);

            Log::info("Migrated account to BFF OAuth session", [
                'account_id' => $account->id,
                'session_id' => $session->id,
            ]);

            return $session;
        } catch (\Exception $e) {
            Log::error("Failed to migrate account to BFF", [
                'account_id' => $account->id,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    /**
     * Create a session that requires re-authentication
     * (For accounts with expired tokens)
     */
    private function createRequiresReauthSession(User $user, ConnectedAccount $account): OAuthSession
    {
        return OAuthSession::create([
            'user_id' => $user->id,
            'account_id' => $account->id,
            'microsoft_email' => $account->email,
            'tenant_id' => $account->oauth_tenant_id ?? 'common',
            'session_token' => \Illuminate\Support\Str::random(64),
            'session_expires_at' => now()->addDays(30),
            'requires_reauth' => true,
            'last_refresh_error' => 'Refresh token expired during migration. Please re-authenticate.',
        ]);
    }

    /**
     * Migrate all users (bulk operation)
     * Returns stats about migration
     */
    public function migrateAllUsers(): array
    {
        $stats = [
            'total_users' => 0,
            'migrated' => 0,
            'failed' => 0,
            'requires_reauth' => 0,
            'errors' => [],
        ];

        $users = User::whereHas('connectedAccounts', function ($query) {
            $query->whereIn('connection_type', ['oauth_manual', 'office365']);
        })->get();

        foreach ($users as $user) {
            $stats['total_users']++;

            try {
                $session = $this->migrateJwtUserToBFF($user);

                if ($session) {
                    if ($session->requires_reauth) {
                        $stats['requires_reauth']++;
                    } else {
                        $stats['migrated']++;
                    }
                } else {
                    $stats['failed']++;
                }
            } catch (\Exception $e) {
                $stats['failed']++;
                $stats['errors'][] = [
                    'user_id' => $user->id,
                    'error' => $e->getMessage(),
                ];
            }
        }

        Log::info("Bulk migration completed", $stats);

        return $stats;
    }
}
