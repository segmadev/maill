<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OAuthSession extends Model
{
    protected $table = 'oauth_sessions';

    protected $fillable = [
        'user_id',
        'account_id',
        'microsoft_access_token',
        'microsoft_refresh_token',
        'token_expires_at',
        'refresh_token_expires_at',
        'account_type',
        'tenant_id',
        'microsoft_email',
        'microsoft_user_id',
        'last_refreshed_at',
        'refresh_failed_count',
        'last_refresh_error',
        'requires_reauth',
        'pkce_code_challenge',
        'oauth_state',
        'state_expires_at',
        'session_token',
        'session_expires_at',
        'last_activity_at',
    ];

    protected $casts = [
        'token_expires_at' => 'datetime',
        'refresh_token_expires_at' => 'datetime',
        'last_refreshed_at' => 'datetime',
        'state_expires_at' => 'datetime',
        'session_expires_at' => 'datetime',
        'last_activity_at' => 'datetime',
        'requires_reauth' => 'boolean',
    ];

    /**
     * User relationship
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Connected account relationship
     */
    public function account(): BelongsTo
    {
        return $this->belongsTo(ConnectedAccount::class);
    }

    /**
     * Check if access token is expired
     */
    public function isAccessTokenExpired(): bool
    {
        if (!$this->token_expires_at) {
            return true;
        }
        return now()->isAfter($this->token_expires_at);
    }

    /**
     * Check if refresh token is expired
     */
    public function isRefreshTokenExpired(): bool
    {
        if (!$this->refresh_token_expires_at) {
            return true;
        }
        return now()->isAfter($this->refresh_token_expires_at);
    }

    /**
     * Check if access token expires soon (within X minutes)
     */
    public function accessTokenExpiresSoon(int $minutes = 5): bool
    {
        if (!$this->token_expires_at) {
            return true;
        }
        return now()->addMinutes($minutes)->isAfter($this->token_expires_at);
    }

    /**
     * Check if session is still valid
     */
    public function isSessionValid(): bool
    {
        if (!$this->session_expires_at) {
            return false;
        }
        return now()->isBefore($this->session_expires_at);
    }

    /**
     * Update last activity
     */
    public function updateActivity(): void
    {
        $this->update(['last_activity_at' => now()]);
    }

    /**
     * Mark as requiring re-authentication
     */
    public function markRequiresReauth(string $error = null): void
    {
        $this->update([
            'requires_reauth' => true,
            'microsoft_refresh_token' => null,
            'microsoft_access_token' => null,
            'last_refresh_error' => $error,
        ]);
    }
}
