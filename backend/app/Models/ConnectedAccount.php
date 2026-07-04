<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class ConnectedAccount extends Model
{
    protected $fillable = [
        'user_id',
        'email',
        'display_name',
        'avatar_url',
        'access_token',
        'refresh_token',
        'token_expires_at',
        'is_primary',
        'connection_type',
        'smtp_credentials',
        'priority',
        'oauth_client_id',
        'oauth_client_secret',
        'oauth_tenant_id',
        'oauth_scopes',
        'oauth_redirect_uri',
        'refresh_token_expires_at',
        'refresh_failed_count',
        'last_refresh_attempt_at',
    ];

    protected $hidden = ['access_token', 'refresh_token', 'smtp_credentials', 'oauth_client_secret'];

    protected $casts = [
        'token_expires_at'            => 'datetime',
        'refresh_token_expires_at'    => 'datetime',
        'last_refresh_attempt_at'     => 'datetime',
        'is_primary'                  => 'boolean',
        'created_at'                  => 'datetime',
        'updated_at'                  => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function folders(): HasMany
    {
        return $this->hasMany(EmailFolder::class, 'account_id');
    }

    public function emails(): HasMany
    {
        return $this->hasMany(Email::class, 'account_id');
    }

    public function signatures(): BelongsToMany
    {
        return $this->belongsToMany(EmailSignature::class, 'account_signatures', 'account_id', 'signature_id')
            ->withPivot('is_default')
            ->withTimestamps();
    }

    public function rules(): HasMany
    {
        return $this->hasMany(OutlookRule::class, 'account_id');
    }

    /**
     * True when the access token expires within the next 10 minutes.
     * Used by TokenRefreshMiddleware as a last-resort per-request refresh.
     * The scheduled `tokens:refresh` command handles the proactive 45-minute window.
     */
    public function tokenNeedsRefresh(): bool
    {
        return $this->token_expires_at?->subMinutes(10)->isPast() ?? false;
    }

    /**
     * Returns a client-friendly status string based on token expiry.
     * - valid    : expires more than 1 hour from now
     * - expiring : expires within the next hour
     * - expired  : already past expiry
     * - unknown  : no expiry date on record
     */
    public function tokenStatus(): string
    {
        $exp = $this->token_expires_at;
        if ($exp === null)                        return 'unknown';
        if ($exp->isPast())                       return 'expired';
        if ($exp->lt(now()->addMinutes(30)))      return 'expiring'; // < 30 min remaining
        return 'valid';
    }

    /**
     * Check if access token has expired
     */
    public function tokenIsExpired(): bool
    {
        return $this->token_expires_at && now()->isAfter($this->token_expires_at);
    }

    /**
     * Check if refresh token has expired
     */
    public function refreshTokenIsExpired(): bool
    {
        return $this->refresh_token_expires_at && now()->isAfter($this->refresh_token_expires_at);
    }

    /**
     * Get minutes remaining until token expires
     */
    public function minutesUntilTokenExpires(): int
    {
        if (!$this->token_expires_at) {
            return -1; // Unknown
        }

        $diff = now()->diffInMinutes($this->token_expires_at, false);
        return $diff < 0 ? 0 : $diff;
    }

    /**
     * Get minutes remaining until refresh token expires
     */
    public function minutesUntilRefreshTokenExpires(): int
    {
        if (!$this->refresh_token_expires_at) {
            return -1; // Unknown
        }

        $diff = now()->diffInMinutes($this->refresh_token_expires_at, false);
        return $diff < 0 ? 0 : $diff;
    }

    /**
     * Make a Graph API request using this account's access token
     */
    public function graphRequest(string $method, string $endpoint, array $data = []): array
    {
        $encryptionService = app(\App\Services\EncryptionService::class);
        $token = $encryptionService->decrypt($this->access_token);

        $client = new \GuzzleHttp\Client([
            'base_uri' => 'https://graph.microsoft.com/v1.0/',
            'headers' => [
                'Authorization' => "Bearer {$token}",
                'Content-Type' => 'application/json',
            ],
            'timeout' => 15,
        ]);

        try {
            $response = $client->request(strtoupper($method), $endpoint, $data ? ['json' => $data] : []);
            return json_decode($response->getBody(), true) ?? [];
        } catch (\GuzzleHttp\Exception\RequestException $e) {
            throw new \RuntimeException(
                'Graph API Error: ' . $e->getResponse()->getStatusCode() . ' ' . $e->getMessage()
            );
        }
    }
}
