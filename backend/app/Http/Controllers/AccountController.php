<?php

namespace App\Http\Controllers;

use App\Models\ConnectedAccount;
use App\Models\Setting;
use App\Services\TokenEncryptionService;
use App\Services\TokenRefreshService;
use App\Services\SmtpService;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\StreamHandler;
use GuzzleHttp\HandlerStack;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class AccountController extends Controller
{
    public function __construct(private TokenEncryptionService $encryption) {}

    // =========================================================================
    // GET /api/accounts
    // Admins receive every connected account; users receive only their own.
    // =========================================================================
    public function index(Request $request): JsonResponse
    {
        $isAdmin = (bool) $request->user()?->is_admin;

        $query = ConnectedAccount::orderByDesc('is_primary')->orderBy('created_at');

        if ($isAdmin) {
            $query->with('user:id,name,email');
        } else {
            $query->where('user_id', $request->input('auth_user_id'));
        }

        // Deduplicate by email — keep the most recently updated row per address.
        // This handles any duplicate records that existed before the upsertAccount
        // fix enforced one-row-per-email at write time.
        $accounts = $query->get()
            ->groupBy('email')
            ->map(fn ($group) => $group->sortByDesc('updated_at')->first())
            ->values()
            ->map(fn ($a) => $this->publicPayload($a, $isAdmin));

        return response()->json(['accounts' => $accounts]);
    }

    // =========================================================================
    // DELETE /api/accounts/{id}
    // =========================================================================
    public function destroy(Request $request, int $id): JsonResponse
    {
        $isAdmin = (bool) $request->user()?->is_admin;

        $query = ConnectedAccount::where('id', $id);
        if (! $isAdmin) {
            $query->where('user_id', $request->input('auth_user_id'));
        }

        $account = $query->first();

        if ($account === null) {
            return response()->json([
                'error'   => 'not_found',
                'message' => 'Account not found or does not belong to you.',
            ], 404);
        }

        $account->delete();

        return response()->json(['message' => 'Account disconnected successfully.']);
    }

    // =========================================================================
    // GET /api/accounts/{id}/token-diagnostic
    // Diagnostic endpoint to troubleshoot token issues
    // =========================================================================
    public function tokenDiagnostic(int $id): JsonResponse
    {
        $account = ConnectedAccount::find($id);

        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $diagnostic = [
            'account_id' => $account->id,
            'email' => $account->email,
            'connection_type' => $account->connection_type,
            'checks' => [
                'has_access_token' => !empty($account->access_token),
                'has_refresh_token' => !empty($account->refresh_token),
                'token_expires_at' => $account->token_expires_at?->toIso8601String(),
                'token_is_expired' => $account->tokenIsExpired(),
                'minutes_until_expiry' => $account->minutesUntilTokenExpires(),
                'refresh_token_expires_at' => $account->refresh_token_expires_at?->toIso8601String(),
                'refresh_token_is_expired' => $account->refreshTokenIsExpired(),
                'token_status' => $account->tokenStatus(),
            ],
            'oauth_config' => [
                'has_client_id' => !empty($account->oauth_client_id),
                'has_client_secret' => !empty($account->oauth_client_secret),
                'has_tenant_id' => !empty($account->oauth_tenant_id),
                'tenant_id' => $account->oauth_tenant_id ?? 'common (default)',
            ],
            'failure_tracking' => [
                'refresh_failed_count' => $account->refresh_failed_count ?? 0,
                'last_refresh_attempt_at' => $account->last_refresh_attempt_at?->toIso8601String(),
                'requires_reconnect' => ($account->refresh_failed_count ?? 0) >= 3,
            ],
            'issues' => [],
        ];

        // Identify issues
        if (empty($account->access_token)) {
            $diagnostic['issues'][] = 'No access token stored';
        }
        if (empty($account->refresh_token)) {
            $diagnostic['issues'][] = 'No refresh token stored - cannot renew';
        }
        if ($account->refreshTokenIsExpired()) {
            $diagnostic['issues'][] = 'Refresh token expired - must reconnect account';
        }
        if ($account->connection_type === 'oauth_manual' && empty($account->oauth_client_id)) {
            $diagnostic['issues'][] = 'OAuth Client ID missing for manual account';
        }
        if ($account->connection_type === 'oauth_manual' && empty($account->oauth_client_secret)) {
            $diagnostic['issues'][] = 'OAuth Client Secret missing for manual account';
        }
        if (($account->refresh_failed_count ?? 0) >= 3) {
            $diagnostic['issues'][] = 'Failed refresh 3+ times - reconnection required';
        }

        // Recommendation
        if (!empty($diagnostic['issues'])) {
            if (in_array('Refresh token expired - must reconnect account', $diagnostic['issues'])) {
                $diagnostic['recommendation'] = 'Reconnect this account via "Add Account" button';
            } elseif (in_array('Failed refresh 3+ times - reconnection required', $diagnostic['issues'])) {
                $diagnostic['recommendation'] = 'Try manual refresh, or reconnect if that fails';
            } else {
                $diagnostic['recommendation'] = 'Account has configuration issues - try reconnecting';
            }
        } else {
            $diagnostic['recommendation'] = $account->tokenStatus() === 'valid' ? 'Token is healthy' : 'Try manual refresh';
        }

        return response()->json($diagnostic);
    }

    // =========================================================================
    // POST /api/accounts/{id}/refresh
    //
    // Attempts a server-side token refresh using the stored refresh_token.
    // Returns updated expiry + status on success, or an error code on failure.
    // For oauth_manual accounts, returns a code to re-authenticate via device code.
    // =========================================================================
    public function refresh(Request $request, int $id): JsonResponse
    {
        Log::info("=== REFRESH ENDPOINT START ===", ['account_id' => $id]);
        Log::info("Request method: " . $request->getMethod());
        Log::info("Request URL: " . $request->url());
        Log::info("Request user: " . $request->user()?->id);
        Log::info("Auth user ID from request: " . $request->input('auth_user_id'));

        $isAdmin = (bool) $request->user()?->is_admin;
        Log::info("Is admin: " . ($isAdmin ? 'yes' : 'no'));

        $query = ConnectedAccount::where('id', $id);
        if (! $isAdmin) {
            $authUserId = $request->input('auth_user_id');
            Log::info("Adding user_id filter: " . $authUserId);
            $query->where('user_id', $authUserId);
        }

        $account = $query->first();
        Log::info("Account query result", ['found' => $account ? 'yes' : 'no', 'account_id' => $account?->id, 'email' => $account?->email]);

        if ($account === null) {
            Log::warning("Account not found: id=$id, auth_user_id=" . $request->input('auth_user_id') . ", is_admin=$isAdmin");
            return response()->json([
                'error'   => 'not_found',
                'message' => 'Account not found or does not belong to you.',
            ], 404)->header('Access-Control-Allow-Origin', $request->header('Origin') ?? '*')
              ->header('Access-Control-Allow-Methods', 'POST, OPTIONS')
              ->header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
              ->header('Access-Control-Allow-Credentials', 'true');
        }

        try {
            Log::info("Calling TokenRefreshService for account: " . $account->email);

            // Check for common issues before attempting refresh
            $preCheckIssues = [];

            if (empty($account->refresh_token)) {
                $preCheckIssues[] = 'Refresh token is empty';
            }

            if ($account->connection_type === 'oauth_manual') {
                if (empty($account->oauth_client_id)) {
                    $preCheckIssues[] = 'OAuth client ID is missing';
                }
                if (empty($account->oauth_client_secret)) {
                    $preCheckIssues[] = 'OAuth client secret is missing';
                }
            }

            if (!empty($preCheckIssues)) {
                Log::warning("Pre-check failed for account {$account->id}: " . implode(', ', $preCheckIssues));
                return response()->json([
                    'status'           => 'error',
                    'message'          => 'Account configuration incomplete: ' . implode('; ', $preCheckIssues),
                    'error_code'       => 'config_incomplete',
                    'details'          => $preCheckIssues,
                ], 422)->header('Access-Control-Allow-Origin', $request->header('Origin') ?? '*')
                  ->header('Access-Control-Allow-Methods', 'POST, OPTIONS')
                  ->header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
                  ->header('Access-Control-Allow-Credentials', 'true');
            }

            // Use the new TokenRefreshService
            $tokenRefreshService = app(TokenRefreshService::class);
            $success = $tokenRefreshService->refreshToken($account);

            if (!$success) {
                Log::warning("TokenRefreshService returned false for account: " . $account->email);
                $account->refresh(); // Reload to get updated failure_count
                return response()->json([
                    'status'           => 'error',
                    'message'          => 'Token refresh failed. Please reconnect your account.',
                    'error_code'       => 'refresh_failed',
                    'failure_count'    => $account->refresh_failed_count,
                    'requires_reconnect' => $account->refresh_failed_count >= 3,
                ], 422)->header('Access-Control-Allow-Origin', $request->header('Origin') ?? '*')
                  ->header('Access-Control-Allow-Methods', 'POST, OPTIONS')
                  ->header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
                  ->header('Access-Control-Allow-Credentials', 'true');
            }

            Log::info("TokenRefreshService succeeded for account: " . $account->email);
            $fresh = $account->fresh();
            Log::info("=== REFRESH ENDPOINT SUCCESS ===", [
                'account_id' => $fresh->id,
                'email' => $fresh->email,
                'token_expires_at' => $fresh->token_expires_at?->toISOString(),
            ]);
            return response()->json([
                'status'           => 'success',
                'message'          => 'Token refreshed successfully.',
                'token_expires_at' => $fresh->token_expires_at?->toISOString(),
                'token_status'     => $fresh->tokenStatus(),
                'minutes_remaining' => $fresh->minutesUntilTokenExpires(),
            ])->header('Access-Control-Allow-Origin', $request->header('Origin') ?? '*')
              ->header('Access-Control-Allow-Methods', 'POST, OPTIONS')
              ->header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
              ->header('Access-Control-Allow-Credentials', 'true');
        } catch (\Throwable $e) {
            Log::error("=== REFRESH ENDPOINT EXCEPTION ===", [
                'account_id' => $id,
                'exception' => get_class($e),
                'message' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'email' => $account->email,
            ]);

            // Increment failure count
            $account->increment('refresh_failed_count');
            $account->update(['last_refresh_attempt_at' => now()]);

            // If failed 3+ times, require manual re-authentication
            if ($account->refresh_failed_count >= 3 && $account->connection_type !== 'smtp') {
                try {
                    // Check if we have stored credentials for auto-renewal
                    if (empty($account->oauth_client_secret) || empty($account->oauth_tenant_id)) {
                        throw new \RuntimeException('Missing stored OAuth credentials for auto-renewal.');
                    }

                    $client = new Client([
                        'timeout' => 15,
                        'handler' => HandlerStack::create(new StreamHandler()),
                    ]);

                    $clientSecret = $this->encryption->decrypt($account->oauth_client_secret);

                    $response = $client->post(
                        "https://login.microsoftonline.com/{$account->oauth_tenant_id}/oauth2/v2.0/devicecode",
                        [
                            'form_params' => [
                                'client_id' => $account->oauth_client_id,
                                'scope'     => 'Mail.Read Mail.Send Mail.ReadWrite offline_access',
                            ],
                        ]
                    );

                    $data = json_decode((string) $response->getBody(), true);

                    if (!empty($data['device_code']) && !empty($data['user_code'])) {
                        $encryptedCreds = base64_encode(json_encode([
                            'client_id'     => $account->oauth_client_id,
                            'tenant_id'     => $account->oauth_tenant_id,
                            'client_secret' => $clientSecret,
                            'device_code'   => $data['device_code'],
                            'account_id'    => $account->id,
                            'is_refresh'    => true,
                        ]));

                        return response()->json([
                            'error'           => 'refresh_token_expired',
                            'needs_reauth'    => true,
                            'auto_renew_flow' => true,
                            'message'         => 'Refresh token expired. Auto-starting renewal...',
                            'user_code'       => $data['user_code'],
                            'device_code'     => $data['device_code'],
                            'verification_uri' => $data['verification_uri'],
                            'credentials_token' => $encryptedCreds,
                            'account_id'      => $account->id,
                        ], 422);
                    }
                } catch (\Exception $e) {
                    Log::warning("Auto-renewal device code failed: " . $e->getMessage());
                }

                // Fallback if auto-renewal fails
                return response()->json([
                    'error'           => 'refresh_failed',
                    'needs_reconnect' => true,
                    'message'         => 'Refresh token expired. Please renew via the Accounts page.',
                ], 422);
            }

            // For regular OAuth connections
            return response()->json([
                'error'           => 'refresh_failed',
                'needs_reconnect' => true,
                'message'         => 'The stored refresh token has expired. Please reconnect the account via Microsoft sign-in.',
            ], 422);
        }
    }

    // =========================================================================
    // POST /api/admin/accounts/oauth-manual/start
    // Admin: Initiate device code flow with custom Azure credentials
    // =========================================================================
    public function startOAuthManualDeviceCode(Request $request): JsonResponse
    {
        if (!$request->user()?->is_admin) {
            return response()->json([
                'error'   => 'unauthorized',
                'message' => 'Only admins can initiate OAuth device code flow.',
            ], 403);
        }

        $validated = $request->validate([
            'client_id'     => 'required|string',
            'tenant_id'     => 'required|string',
            'client_secret' => 'required|string',
        ]);

        try {
            $client = new Client([
                'timeout' => 15,
                'handler' => HandlerStack::create(new StreamHandler()),
            ]);

            $response = $client->post(
                "https://login.microsoftonline.com/{$validated['tenant_id']}/oauth2/v2.0/devicecode",
                [
                    'form_params' => [
                        'client_id' => $validated['client_id'],
                        'scope'     => 'Mail.Read Mail.Send Mail.ReadWrite offline_access',
                    ],
                ]
            );

            $data = json_decode((string) $response->getBody(), true);

            if (empty($data['device_code']) || empty($data['user_code'])) {
                return response()->json([
                    'error'   => 'invalid_response',
                    'message' => 'Microsoft returned invalid device code response.',
                ], 422);
            }

            // Encrypt credentials for the polling phase
            $encryptedCreds = base64_encode(json_encode([
                'client_id'     => $validated['client_id'],
                'tenant_id'     => $validated['tenant_id'],
                'client_secret' => $validated['client_secret'],
                'device_code'   => $data['device_code'],
            ]));

            return response()->json([
                'user_code'      => $data['user_code'],
                'device_code'    => $data['device_code'],
                'verification_uri' => $data['verification_uri'],
                'expires_in'     => $data['expires_in'],
                'interval'       => $data['interval'],
                'message'        => $data['message'],
                'credentials_token' => $encryptedCreds,
            ]);
        } catch (\Exception $e) {
            Log::warning("Device code request failed: " . $e->getMessage());
            return response()->json([
                'error'   => 'device_code_failed',
                'message' => 'Failed to initiate device code flow: ' . $e->getMessage(),
            ], 422);
        }
    }

    // =========================================================================
    // POST /api/admin/accounts/oauth-manual/poll
    // Admin: Poll for token completion and create account
    // =========================================================================
    public function pollOAuthManualDeviceCode(Request $request): JsonResponse
    {
        if (!$request->user()?->is_admin) {
            return response()->json([
                'error'   => 'unauthorized',
                'message' => 'Only admins can poll device code flow.',
            ], 403);
        }

        $validated = $request->validate([
            'email'              => 'required|email',
            'display_name'       => 'required|string|max:255',
            'redirect_uri'       => 'nullable|url',
            'credentials_token'  => 'required|string',
        ]);

        try {
            $creds = json_decode(base64_decode($validated['credentials_token']), true);
        } catch (\Exception $e) {
            return response()->json([
                'error'   => 'invalid_token',
                'message' => 'Invalid credentials token.',
            ], 400);
        }

        // Check if account already exists
        $existingAccount = ConnectedAccount::where('email', $validated['email'])->first();
        if ($existingAccount) {
            // Allow replacement for oauth_manual (update credentials)
            // or different connection types
            Log::info("Replacing {$existingAccount->connection_type} connection with oauth_manual for {$validated['email']}");
            $existingAccount->delete();
        }

        try {
            $client = new Client([
                'timeout' => 15,
                'handler' => HandlerStack::create(new StreamHandler()),
            ]);

            $response = $client->post(
                "https://login.microsoftonline.com/{$creds['tenant_id']}/oauth2/v2.0/token",
                [
                    'form_params' => [
                        'grant_type'  => 'urn:ietf:params:oauth:grant-type:device_code',
                        'client_id'   => $creds['client_id'],
                        'client_secret' => $creds['client_secret'],
                        'device_code' => $creds['device_code'],
                    ],
                ]
            );

            $data = json_decode((string) $response->getBody(), true);

            if (!empty($data['error'])) {
                if ($data['error'] === 'authorization_pending') {
                    return response()->json([
                        'status'  => 'pending',
                        'message' => 'Waiting for user to complete authentication...',
                    ]);
                }
                return response()->json([
                    'error'   => $data['error'],
                    'message' => $data['error_description'] ?? 'Token request failed.',
                ], 422);
            }

            if (empty($data['access_token'])) {
                return response()->json([
                    'error'   => 'no_token',
                    'message' => 'Microsoft did not return an access token.',
                ], 422);
            }

            // Create the connected account
            $refreshTokenExpiresAt = now()->addDays(90); // Microsoft refresh tokens expire after ~90 days

            $account = ConnectedAccount::create([
                'user_id'                   => $request->user()->id,
                'email'                     => $validated['email'],
                'display_name'              => $validated['display_name'],
                'access_token'              => $this->encryption->encrypt($data['access_token']),
                'refresh_token'             => $this->encryption->encrypt($data['refresh_token'] ?? ''),
                'token_expires_at'          => now()->addSeconds((int) ($data['expires_in'] ?? 3600)),
                'refresh_token_expires_at'  => $refreshTokenExpiresAt,
                'connection_type'           => 'oauth_manual',
                'oauth_client_id'           => $creds['client_id'],
                'oauth_client_secret'       => $this->encryption->encrypt($creds['client_secret']),
                'oauth_tenant_id'           => $creds['tenant_id'],
                'oauth_redirect_uri'        => $validated['redirect_uri'],
                'is_primary'                => false,
            ]);

            Log::info("OAuth Manual account created for {$validated['email']}, refresh token expires at: {$refreshTokenExpiresAt->toIso8601String()}");

            return response()->json([
                'status'  => 'success',
                'message' => 'Account connected successfully!',
                'account' => $this->publicPayload($account, true),
            ], 201);
        } catch (\Exception $e) {
            Log::warning("Device code poll failed: " . $e->getMessage());
            return response()->json([
                'error'   => 'poll_failed',
                'message' => 'Failed to complete authentication: ' . $e->getMessage(),
            ], 422);
        }
    }

    // =========================================================================
    // POST /api/accounts/connect/smtp
    // Admin: add an SMTP connection after testing it
    // =========================================================================
    public function connectSmtp(Request $request, SmtpService $smtp): JsonResponse
    {
        if (!$request->user()?->is_admin) {
            return response()->json([
                'error'   => 'unauthorized',
                'message' => 'Only admins can add SMTP connections.',
            ], 403);
        }

        $validated = $request->validate([
            'email'        => 'required|email',
            'display_name' => 'required|string|max:255',
            'smtp_host'    => 'required|string',
            'smtp_port'    => 'required|integer|min:1|max:65535',
            'smtp_user'    => 'required|string',
            'smtp_pass'    => 'required|string',
            'use_tls'      => 'boolean',
            'use_ssl'      => 'boolean',
        ]);

        $existingAccount = ConnectedAccount::where('email', $validated['email'])->where('connection_type', 'smtp')->first();
        $shouldReplace = false;
        if ($existingAccount) {
            // Only allow replacement for same connection type (smtp replacing smtp)
            $shouldReplace = true;
        }

        // Test SMTP connection first
        try {
            $smtpCreds = [
                'host'     => $validated['smtp_host'],
                'port'     => $validated['smtp_port'],
                'username' => $validated['smtp_user'],
                'password' => $validated['smtp_pass'],
                'use_tls'  => $validated['use_tls'] ?? true,
                'use_ssl'  => $validated['use_ssl'] ?? false,
            ];

            $smtp->testConnection($smtpCreds);
        } catch (RuntimeException $e) {
            return response()->json([
                'error'   => 'smtp_test_failed',
                'message' => 'SMTP connection test failed: ' . $e->getMessage(),
            ], 422);
        }

        // Replace if needed (only if same connection type)
        if ($shouldReplace) {
            Log::info("Replacing smtp connection with new smtp for {$validated['email']}");
            $existingAccount->delete();
        }

        $account = ConnectedAccount::create([
            'user_id'               => $request->user()->id,
            'email'                 => $validated['email'],
            'display_name'          => $validated['display_name'],
            'connection_type'       => 'smtp',
            'access_token'          => $this->encryption->encrypt('smtp-only'),
            'refresh_token'         => $this->encryption->encrypt('smtp-only'),
            'token_expires_at'      => now()->addYears(10),
            'refresh_token_expires_at' => now()->addYears(10),
            'oauth_scopes'          => null,
            'oauth_client_id'       => null,
            'oauth_client_secret'   => null,
            'oauth_tenant_id'       => null,
            'smtp_credentials'      => $this->encryption->encrypt(json_encode($smtpCreds)),
            'is_primary'            => false,
        ]);

        return response()->json([
            'message' => 'SMTP connection added successfully.',
            'account' => $this->publicPayload($account, true),
        ], 201);
    }

    // =========================================================================
    // POST /api/accounts/{id}/test-smtp
    // Test SMTP credentials for an existing or new account
    // =========================================================================
    public function testSmtp(Request $request, SmtpService $smtp): JsonResponse
    {
        if (!$request->user()?->is_admin) {
            return response()->json([
                'error'   => 'unauthorized',
                'message' => 'Only admins can test SMTP connections.',
            ], 403);
        }

        $validated = $request->validate([
            'smtp_host' => 'required|string',
            'smtp_port' => 'required|integer|min:1|max:65535',
            'smtp_user' => 'required|string',
            'smtp_pass' => 'required|string',
            'use_tls'   => 'boolean',
            'use_ssl'   => 'boolean',
        ]);

        try {
            $smtpCreds = [
                'host'     => $validated['smtp_host'],
                'port'     => $validated['smtp_port'],
                'username' => $validated['smtp_user'],
                'password' => $validated['smtp_pass'],
                'use_tls'  => $validated['use_tls'] ?? true,
                'use_ssl'  => $validated['use_ssl'] ?? false,
            ];

            $smtp->testConnection($smtpCreds);

            return response()->json([
                'success' => true,
                'message' => 'SMTP connection test successful!',
            ]);
        } catch (RuntimeException $e) {
            return response()->json([
                'error'   => 'smtp_test_failed',
                'message' => 'SMTP connection test failed: ' . $e->getMessage(),
            ], 422);
        }
    }

    // =========================================================================
    // POST /api/admin/accounts/{id}/renew-refresh-token
    // Admin: Renew refresh token for oauth_manual account via device code flow
    // =========================================================================
    public function renewRefreshToken(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->is_admin) {
            return response()->json([
                'error'   => 'unauthorized',
                'message' => 'Only admins can renew refresh tokens.',
            ], 403);
        }

        $account = ConnectedAccount::find($id);

        if (!$account || $account->connection_type !== 'oauth_manual') {
            return response()->json([
                'error'   => 'not_found',
                'message' => 'OAuth Manual account not found.',
            ], 404);
        }

        if (empty($account->oauth_client_secret) || empty($account->oauth_tenant_id)) {
            return response()->json([
                'error'   => 'missing_credentials',
                'message' => 'Missing stored OAuth credentials. Please reconnect this account.',
            ], 422);
        }

        try {
            $client = new Client([
                'timeout' => 15,
                'handler' => HandlerStack::create(new StreamHandler()),
            ]);

            $clientSecret = $this->encryption->decrypt($account->oauth_client_secret);

            $response = $client->post(
                "https://login.microsoftonline.com/{$account->oauth_tenant_id}/oauth2/v2.0/devicecode",
                [
                    'form_params' => [
                        'client_id' => $account->oauth_client_id,
                        'scope'     => 'Mail.Read Mail.Send Mail.ReadWrite offline_access',
                    ],
                ]
            );

            $data = json_decode((string) $response->getBody(), true);

            if (empty($data['device_code']) || empty($data['user_code'])) {
                return response()->json([
                    'error'   => 'invalid_response',
                    'message' => 'Microsoft returned invalid device code response.',
                ], 422);
            }

            $encryptedCreds = base64_encode(json_encode([
                'client_id'     => $account->oauth_client_id,
                'tenant_id'     => $account->oauth_tenant_id,
                'client_secret' => $clientSecret,
                'device_code'   => $data['device_code'],
                'account_id'    => $account->id,
                'is_refresh'    => true,
            ]));

            return response()->json([
                'user_code'      => $data['user_code'],
                'device_code'    => $data['device_code'],
                'verification_uri' => $data['verification_uri'],
                'expires_in'     => $data['expires_in'],
                'interval'       => $data['interval'],
                'message'        => $data['message'],
                'credentials_token' => $encryptedCreds,
                'account_id'     => $account->id,
            ]);
        } catch (\Exception $e) {
            Log::warning("Device code request failed for refresh: " . $e->getMessage());
            return response()->json([
                'error'   => 'device_code_failed',
                'message' => 'Failed to initiate device code flow: ' . $e->getMessage(),
            ], 422);
        }
    }

    // =========================================================================
    // POST /api/admin/accounts/renew-refresh-token/poll
    // Admin: Poll for refresh token renewal completion
    // =========================================================================
    public function pollRenewRefreshToken(Request $request): JsonResponse
    {
        if (!$request->user()?->is_admin) {
            return response()->json([
                'error'   => 'unauthorized',
                'message' => 'Only admins can poll refresh token renewal.',
            ], 403);
        }

        $validated = $request->validate([
            'credentials_token' => 'required|string',
        ]);

        try {
            $creds = json_decode(base64_decode($validated['credentials_token']), true);
        } catch (\Exception $e) {
            return response()->json([
                'error'   => 'invalid_token',
                'message' => 'Invalid credentials token.',
            ], 400);
        }

        $account = ConnectedAccount::find($creds['account_id']);

        if (!$account) {
            return response()->json([
                'error'   => 'not_found',
                'message' => 'Account not found.',
            ], 404);
        }

        try {
            $client = new Client([
                'timeout' => 15,
                'handler' => HandlerStack::create(new StreamHandler()),
            ]);

            $response = $client->post(
                "https://login.microsoftonline.com/{$creds['tenant_id']}/oauth2/v2.0/token",
                [
                    'form_params' => [
                        'grant_type'    => 'urn:ietf:params:oauth:grant-type:device_code',
                        'client_id'     => $creds['client_id'],
                        'client_secret' => $creds['client_secret'],
                        'device_code'   => $creds['device_code'],
                    ],
                ]
            );

            $data = json_decode((string) $response->getBody(), true);

            if (!empty($data['error'])) {
                if ($data['error'] === 'authorization_pending') {
                    return response()->json([
                        'status'  => 'pending',
                        'message' => 'Waiting for user to complete authentication...',
                    ]);
                }
                return response()->json([
                    'error'   => $data['error'],
                    'message' => $data['error_description'] ?? 'Token request failed.',
                ], 422);
            }

            if (empty($data['access_token'])) {
                return response()->json([
                    'error'   => 'no_token',
                    'message' => 'Microsoft did not return an access token.',
                ], 422);
            }

            // Update the account with new tokens
            $refreshTokenExpiresAt = now()->addDays(90);

            $account->update([
                'access_token'              => $this->encryption->encrypt($data['access_token']),
                'refresh_token'             => $this->encryption->encrypt($data['refresh_token'] ?? $this->encryption->decrypt($account->refresh_token)),
                'token_expires_at'          => now()->addSeconds((int) ($data['expires_in'] ?? 3600)),
                'refresh_token_expires_at'  => $refreshTokenExpiresAt,
            ]);

            Log::info("OAuth Manual account {$account->email} refresh token renewed, expires at: {$refreshTokenExpiresAt->toIso8601String()}");

            return response()->json([
                'status'  => 'success',
                'message' => 'Refresh token renewed successfully!',
                'account' => $this->publicPayload($account, true),
            ], 200);
        } catch (\Exception $e) {
            Log::warning("Device code poll failed for refresh: " . $e->getMessage());
            return response()->json([
                'error'   => 'poll_failed',
                'message' => 'Failed to complete authentication: ' . $e->getMessage(),
            ], 422);
        }
    }

    // =========================================================================
    // PATCH /api/accounts/{id}/priority
    // Set the priority/fallback order for an account
    // =========================================================================
    public function updatePriority(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->is_admin) {
            return response()->json([
                'error'   => 'unauthorized',
                'message' => 'Only admins can update account priority.',
            ], 403);
        }

        $validated = $request->validate([
            'priority' => 'nullable|integer|min:1',
        ]);

        $account = ConnectedAccount::find($id);

        if (!$account) {
            return response()->json([
                'error'   => 'not_found',
                'message' => 'Account not found.',
            ], 404);
        }

        $account->update(['priority' => $validated['priority']]);

        return response()->json([
            'message' => 'Account priority updated.',
            'account' => $this->publicPayload($account, true),
        ]);
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    private function publicPayload(ConnectedAccount $a, bool $includeOwner = false): array
    {
        $payload = [
            'id'                        => $a->id,
            'email'                     => $a->email,
            'display_name'              => $a->display_name,
            'avatar_url'                => $a->avatar_url,
            'is_primary'                => $a->is_primary,
            'connection_type'           => $a->connection_type ?? 'oauth',
            'priority'                  => $a->priority,
            'created_at'                => $a->created_at?->toISOString(),
            'token_expires_at'          => $a->token_expires_at?->toISOString(),
            'token_status'              => $a->tokenStatus(),
            'refresh_token_expires_at'  => $a->refresh_token_expires_at?->toISOString(),
        ];

        // Include OAuth connection details for oauth_manual accounts
        if ($a->connection_type === 'oauth_manual') {
            $payload['oauth_client_id']     = $a->oauth_client_id;
            $payload['oauth_tenant_id']     = $a->oauth_tenant_id;
            $payload['oauth_redirect_uri']  = $a->oauth_redirect_uri;
        }

        if ($includeOwner) {
            $payload['owner_id']    = $a->user_id;
            $payload['owner_name']  = $a->user?->name;
            $payload['owner_email'] = $a->user?->email;
        }

        return $payload;
    }

    /** Resolve Azure credentials: DB settings take priority over .env values. */
    private function azureConfig(): array
    {
        // Check if a default OAuth account is configured
        $defaultAccountId = Setting::first()?->default_oauth_account_id;

        if ($defaultAccountId) {
            $account = ConnectedAccount::find($defaultAccountId);

            if ($account && $account->connection_type === 'oauth_manual') {
                return [
                    'client_id'     => $account->oauth_client_id,
                    'client_secret' => $this->encryption->decrypt($account->oauth_client_secret),
                    'tenant_id'     => $account->oauth_tenant_id,
                ];
            }
        }

        // Fall back to settings or environment variables
        return [
            'client_id'     => Setting::get('azure_client_id')     ?: config('microsoft.client_id'),
            'client_secret' => Setting::get('azure_client_secret') ?: config('microsoft.client_secret'),
            'tenant_id'     => Setting::get('azure_tenant_id')     ?: config('microsoft.tenant_id', 'common'),
        ];
    }

    private function doRefresh(ConnectedAccount $account): void
    {
        $refreshToken = $this->encryption->decrypt($account->refresh_token);

        if (empty($refreshToken)) {
            throw new \RuntimeException('No refresh token stored for this account.');
        }

        $client = new Client([
            'timeout' => 15,
            'handler' => HandlerStack::create(new StreamHandler()),
        ]);

        // For oauth_manual accounts, use stored credentials; otherwise use system-level
        if ($account->connection_type === 'oauth_manual') {
            if (empty($account->oauth_client_id) || empty($account->oauth_client_secret) || empty($account->oauth_tenant_id)) {
                throw new \RuntimeException('Missing stored OAuth credentials for manual account. Please reconnect.');
            }

            $clientId = $account->oauth_client_id;
            $clientSecret = $this->encryption->decrypt($account->oauth_client_secret);
            $tenantId = $account->oauth_tenant_id;
        } else {
            $azure = $this->azureConfig();
            $clientId = $azure['client_id'];
            $clientSecret = $azure['client_secret'];
            $tenantId = $azure['tenant_id'];
        }

        // Build token request params
        // Note: Public clients should NOT send client_secret
        // Only include client_secret if the app is a confidential client
        $isPublicClient = config('microsoft.is_public_client', false);

        $params = [
            'grant_type'    => 'refresh_token',
            'client_id'     => $clientId,
            'refresh_token' => $refreshToken,
            'scope'         => implode(' ', Setting::getMicrosoftScopes('mail')),
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
            throw new \RuntimeException('Microsoft did not return an access_token.');
        }

        $refreshTokenExpiresAt = now()->addDays(90);

        $account->update([
            'access_token'              => $this->encryption->encrypt($data['access_token']),
            'refresh_token'             => $this->encryption->encrypt($data['refresh_token'] ?? $refreshToken),
            'token_expires_at'          => now()->addSeconds((int) ($data['expires_in'] ?? 3600)),
            'refresh_token_expires_at'  => $refreshTokenExpiresAt,
        ]);
    }

    // =========================================================================
    // PATCH /api/admin/accounts/{id}/update-smtp
    // Update SMTP credentials for an SMTP account
    // =========================================================================
    public function updateSmtp(Request $request, $id): JsonResponse
    {
        $account = ConnectedAccount::find($id);

        if (!$account || $account->connection_type !== 'smtp') {
            return response()->json(['error' => 'SMTP account not found'], 404);
        }

        $validated = $request->validate([
            'display_name' => 'required|string',
            'smtp_host'    => 'required|string',
            'smtp_port'    => 'required|integer|between:1,65535',
            'smtp_user'    => 'required|string',
            'smtp_pass'    => 'required|string',
            'use_tls'      => 'boolean',
            'use_ssl'      => 'boolean',
        ]);

        try {
            $smtpCredentials = [
                'host'     => $validated['smtp_host'],
                'port'     => $validated['smtp_port'],
                'username' => $validated['smtp_user'],
                'password' => $validated['smtp_pass'],
                'use_tls'  => $validated['use_tls'] ?? true,
                'use_ssl'  => $validated['use_ssl'] ?? false,
            ];

            $account->update([
                'display_name'     => $validated['display_name'],
                'smtp_credentials' => $this->encryption->encrypt(json_encode($smtpCredentials)),
            ]);

            return response()->json([
                'message' => 'SMTP settings updated successfully',
                'account' => $this->publicPayload($account, true)
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to update SMTP settings', [
                'account_id' => $id,
                'error' => $e->getMessage()
            ]);

            return response()->json([
                'error' => 'Failed to update SMTP settings',
                'message' => $e->getMessage()
            ], 422);
        }
    }
}
