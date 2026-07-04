<?php

namespace App\Http\Middleware;

use App\Models\ConnectedAccount;
use App\Models\Setting;
use App\Services\GraphAPILogger;
use App\Services\TokenEncryptionService;
use Closure;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Handler\StreamHandler;
use GuzzleHttp\HandlerStack;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Before any Graph API call, checks every connected account belonging to the
 * authenticated user and silently refreshes tokens expiring within 5 minutes.
 *
 * Route binding:  apply only to routes that actually call Graph (accounts, emails, folders, search).
 * It does NOT block the request if a refresh fails — the Graph call itself will return 401
 * and the EmailController handles that gracefully.
 */
class TokenRefreshMiddleware
{
    public function __construct(private TokenEncryptionService $encryption) {}

    public function handle(Request $request, Closure $next): Response
    {
        $userId  = $request->input('auth_user_id');
        $isAdmin = (bool) $request->user()?->is_admin;

        if ($userId) {
            if ($isAdmin) {
                // Admins may be acting on any user's account.
                // Refresh the specific account from the route if near-expired,
                // plus any of the admin's own accounts.
                $routeAccountId = (int) $request->route('id');
                if ($routeAccountId) {
                    $target = ConnectedAccount::where('id', $routeAccountId)
                        ->where('token_expires_at', '<', now()->addMinutes(10))
                        ->first();
                    if ($target) $this->refreshAccount($target);
                }
                // Also refresh the admin's own accounts
                $this->refreshExpiredTokens((int) $userId);
            } else {
                $this->refreshExpiredTokens((int) $userId);
            }
        }

        return $next($request);
    }

    private function refreshExpiredTokens(int $userId): void
    {
        $accounts = ConnectedAccount::where('user_id', $userId)
            ->where('token_expires_at', '<', now()->addMinutes(10))
            ->get();

        foreach ($accounts as $account) {
            $this->refreshAccount($account);
        }
    }

    /**
     * Resolve Azure credentials: DB settings take priority over .env values,
     * matching the same logic used in MicrosoftOAuthController::azureConfig().
     */
    private function azureConfig(): array
    {
        return [
            'client_id'     => Setting::get('azure_client_id')     ?: config('microsoft.client_id'),
            'client_secret' => Setting::get('azure_client_secret') ?: config('microsoft.client_secret'),
            'tenant_id'     => Setting::get('azure_tenant_id')     ?: config('microsoft.tenant_id', 'common'),
        ];
    }

    private function refreshAccount(ConnectedAccount $account): void
    {
        $logger = new GraphAPILogger();

        try {
            $refreshToken = $this->encryption->decrypt($account->refresh_token);

            // StreamHandler bypasses c-ares (the async DNS resolver compiled into
            // this libcurl build that cannot reach DNS on this machine).
            $client = new Client([
                'timeout' => 10,
                'handler' => HandlerStack::create(new StreamHandler()),
            ]);

            $azure    = $this->azureConfig();
            $tenantId = $azure['tenant_id'];

            // Build token request params
            // Note: Public clients should NOT send client_secret
            // Only include client_secret if the app is a confidential client
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
                'grant_type'    => 'refresh_token',
                'client_id'     => $azure['client_id'],
                'refresh_token' => $refreshToken,
                'scope'         => $scopeString,
            ];

            // Only add client_secret if this is NOT a public client
            if (!$isPublicClient && !empty($azure['client_secret'])) {
                $params['client_secret'] = $azure['client_secret'];
            }

            $logger->logTokenRefresh($account->id, 'attempting refresh', [
                'email' => $account->email,
                'client_type' => empty($azure['client_secret']) ? 'public' : 'confidential',
                'scopes' => \App\Models\Setting::getMicrosoftScopes('mail'),
            ]);

            $startTime = microtime(true);
            $response = $client->post(
                "https://login.microsoftonline.com/{$tenantId}/oauth2/v2.0/token",
                [
                    'body' => http_build_query($params),
                    'headers' => [
                        'Origin' => rtrim(config('app.url'), '/'),
                        'Content-Type' => 'application/x-www-form-urlencoded',
                    ],
                ]
            );
            $duration = (microtime(true) - $startTime) * 1000;

            $data = json_decode((string) $response->getBody(), true);

            $logger->logTokenRefresh($account->id, 'refresh successful', [
                'email' => $account->email,
                'expires_in' => $data['expires_in'] ?? null,
                'duration_ms' => $duration,
            ]);

            $account->update([
                'access_token'     => $this->encryption->encrypt($data['access_token']),
                'refresh_token'    => $this->encryption->encrypt($data['refresh_token'] ?? $refreshToken),
                'token_expires_at' => now()->addSeconds($data['expires_in']),
            ]);
        } catch (GuzzleException $e) {
            $logger->logError($account->id, 'token_refresh', $e);
            // Log but don't throw — the downstream Graph call will surface the real error.
            Log::warning("Token refresh failed for account {$account->id}: " . $e->getMessage());
        }
    }
}
