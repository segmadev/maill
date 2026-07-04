<?php

namespace App\Console\Commands;

use App\Models\ConnectedAccount;
use App\Services\TokenEncryptionService;
use GuzzleHttp\Client;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Handler\StreamHandler;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class RefreshTokens extends Command
{
    protected $signature = 'tokens:refresh';
    protected $description = 'Refresh access tokens for all connected accounts';

    public function __construct(private TokenEncryptionService $encryption) {
        parent::__construct();
    }

    public function handle(): int
    {
        // Find accounts where token expires within 10 minutes
        $accounts = ConnectedAccount::where('token_expires_at', '<=', now()->addMinutes(10))
            ->where('token_expires_at', '>', now())
            ->whereIn('connection_type', ['oauth', 'oauth_manual'])
            ->get();

        $this->info("Refreshing tokens for " . count($accounts) . " accounts...");

        foreach ($accounts as $account) {
            try {
                $this->refreshToken($account);
                $this->info("✓ Refreshed token for {$account->email}");
            } catch (\Throwable $e) {
                $account->increment('refresh_failed_count');
                $account->update(['last_refresh_attempt_at' => now()]);
                Log::warning("Token refresh failed for {$account->email}: " . $e->getMessage());
                $this->warn("✗ Failed to refresh {$account->email}: " . $e->getMessage());
            }
        }

        return 0;
    }

    private function refreshToken(ConnectedAccount $account): void
    {
        $client = new Client([
            'timeout' => 15,
            'handler' => HandlerStack::create(new StreamHandler()),
        ]);

        $refreshToken = $this->encryption->decrypt($account->refresh_token);

        // Determine which credentials to use based on connection type
        if ($account->connection_type === 'oauth_manual') {
            $clientSecret = $this->encryption->decrypt($account->oauth_client_secret);
            $tenantId = $account->oauth_tenant_id;
            $clientId = $account->oauth_client_id;
        } else {
            // For regular oauth accounts, use app credentials from config
            $clientId = config('microsoft.client_id');
            $clientSecret = config('microsoft.client_secret');
            $tenantId = 'common';
        }

        // Build token request params
        // Note: Public clients should NOT send client_secret
        // Only include client_secret if the app is a confidential client
        $isPublicClient = config('microsoft.is_public_client', false);

        $params = [
            'grant_type'    => 'refresh_token',
            'client_id'     => $clientId,
            'refresh_token' => $refreshToken,
            'scope'         => 'Mail.Read Mail.Send Mail.ReadWrite offline_access',
        ];

        // Only add client_secret if this is NOT a public client
        if (!$isPublicClient && !empty($clientSecret)) {
            $params['client_secret'] = $clientSecret;
        }

        $response = $client->post(
            "https://login.microsoftonline.com/{$tenantId}/oauth2/v2.0/token",
            [
                'form_params' => $params,
            ]
        );

        $data = json_decode((string) $response->getBody(), true);

        if (empty($data['access_token'])) {
            throw new \Exception('No access token in response');
        }

        // Update account with new tokens
        $account->update([
            'access_token'          => $this->encryption->encrypt($data['access_token']),
            'refresh_token'         => $this->encryption->encrypt($data['refresh_token'] ?? $refreshToken),
            'token_expires_at'      => now()->addSeconds((int) ($data['expires_in'] ?? 3600)),
            'refresh_failed_count'  => 0,  // Reset failure count on success
            'last_refresh_attempt_at' => now(),
        ]);

        // Update refresh token expiry if a new refresh token was issued
        if (!empty($data['refresh_token'])) {
            $account->update(['refresh_token_expires_at' => now()->addDays(90)]);
        }

        Log::info("Token refreshed successfully for {$account->email}");
    }
}
