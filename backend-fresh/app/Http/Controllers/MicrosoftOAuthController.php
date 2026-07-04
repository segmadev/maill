<?php

namespace App\Http\Controllers;

use App\Models\ConnectedAccount;
use App\Models\Setting;
use App\Models\User;
use App\Services\TokenEncryptionService;
use Firebase\JWT\JWT;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Handler\StreamHandler;
use GuzzleHttp\HandlerStack;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class MicrosoftOAuthController extends Controller
{
    public function __construct(private TokenEncryptionService $encryption) {}

    // -------------------------------------------------------------------------
    // Resolve Azure credentials: DB settings take priority over .env values.
    // This allows the admin panel to configure OAuth without touching the server.
    // -------------------------------------------------------------------------
    private function azureConfig(): array
    {
        return [
            'client_id'     => Setting::get('azure_client_id')     ?: config('microsoft.client_id'),
            'client_secret' => Setting::get('azure_client_secret') ?: config('microsoft.client_secret'),
            'tenant_id'     => Setting::get('azure_tenant_id')     ?: config('microsoft.tenant_id', 'common'),
            'redirect_uri'  => Setting::get('azure_redirect_uri')  ?: config('microsoft.redirect_uri'),
        ];
    }

    // -------------------------------------------------------------------------
    // GET /api/auth/microsoft/redirect
    //
    // Returns the Microsoft authorization URL that the frontend should navigate
    // the user to. Uses a stateless HMAC-signed `state` parameter to carry the
    // user ID across the redirect — no server-side session required, which means
    // this works correctly on API routes where session middleware is not active.
    // -------------------------------------------------------------------------
    public function redirect(Request $request): JsonResponse
    {
        $userId = (int) $request->input('auth_user_id');
        $nonce  = Str::random(32);

        // Optional: caller can pass a return_url so the callback redirects to the
        // right frontend app (user app vs. admin panel). We validate against the
        // FRONTEND_URLS whitelist to prevent open-redirect abuse.
        $returnUrl  = $request->input('return_url', '');
        $returnUrl  = $this->sanitizeReturnUrl($returnUrl);

        // state = base64(userId:nonce:returnUrl) + "." + HMAC(payload, APP_KEY)
        $state = $this->buildState($userId, $nonce, $returnUrl);

        $azure = $this->azureConfig();

        if (empty($azure['client_id']) || empty($azure['client_secret']) || empty($azure['redirect_uri'])) {
            return response()->json([
                'error'   => 'azure_not_configured',
                'message' => 'Azure credentials are not configured. Please fill in the Azure settings in the Admin Panel → Settings → Azure / Microsoft OAuth.',
            ], 503);
        }

        $params = [
            'client_id'     => $azure['client_id'],
            'response_type' => 'code',
            'redirect_uri'  => $azure['redirect_uri'],
            'response_mode' => 'query',
            'scope'         => implode(' ', Setting::getMicrosoftScopes('mail')), // connecting a mailbox — needs mail access
            'state'         => $state,
            // prompt=select_account forces the account picker so the user can
            // choose which Microsoft account to add (important for multi-account).
            'prompt'        => 'select_account',
        ];

        $url = "https://login.microsoftonline.com/{$azure['tenant_id']}/oauth2/v2.0/authorize?"
            . http_build_query($params);

        return response()->json(['url' => $url]);
    }

    // -------------------------------------------------------------------------
    // GET /api/auth/microsoft/callback
    //
    // Microsoft redirects here with ?code=xxx&state=yyy after the user consents.
    // We exchange the code for tokens, fetch the user's profile from /me,
    // upsert the connected_accounts row, then redirect to the frontend dashboard.
    // -------------------------------------------------------------------------
    public function callback(Request $request): RedirectResponse
    {
        $defaultFrontend = rtrim(env('FRONTEND_URL', 'http://localhost:7100'), '/');

        // Extract the return_url from state early — Microsoft returns the state
        // parameter even on error responses, so we can redirect to the right
        // frontend URL regardless of whether the auth succeeded or failed.
        [$stateUserId, $stateReturnUrl] = $this->verifyState($request->query('state', ''), true);
        $base = rtrim($stateReturnUrl ?: $defaultFrontend, '/');

        // ----- CSRF / error guard -----
        if ($request->has('error')) {
            $error = $request->query('error', '');
            $desc  = $request->query('error_description', 'Unknown error');

            // Detect "organization admin approval required" errors.
            // Microsoft returns error=admin_required OR error=consent_required,
            // and the description typically contains AADSTS65001 or AADSTS90094.
            $isAdminRequired = in_array($error, ['admin_required', 'consent_required'], true)
                || str_contains($desc, 'AADSTS65001')
                || str_contains($desc, 'AADSTS90094');

            if ($isAdminRequired) {
                return redirect("{$base}/?oauth_error=admin_required");
            }

            return redirect("{$base}/?oauth_error=" . urlencode($desc));
        }

        // ----- State verification -----
        if ($stateUserId === null) {
            return redirect("{$defaultFrontend}/?oauth_error=" . urlencode('Invalid or tampered state parameter. Please try again.'));
        }

        // ----- Token exchange -----
        // userId=0 → user login (sign-in scopes only, no mail access)
        // userId>0 → mail account link (mail_scopes requested)
        try {
            $tokens = $this->exchangeCodeForTokens($request->query('code'), null, $stateUserId > 0);
        } catch (\Throwable $e) {
            \Log::error('OAuth token exchange failed', ['error' => $e->getMessage()]);
            return redirect("{$base}/?oauth_error=" . urlencode('Token exchange failed: ' . $e->getMessage()));
        }

        // ----- Fetch Microsoft user profile -----
        try {
            $profile = $this->fetchMicrosoftProfile($tokens['access_token'], $tokens['id_token'] ?? null);
        } catch (\Throwable $e) {
            \Log::error('OAuth profile fetch failed', ['error' => $e->getMessage()]);
            return redirect("{$base}/?oauth_error=" . urlencode('Could not fetch Microsoft profile: ' . $e->getMessage()));
        }

        // ----- Branch: userId=0 → user sign-in/register; userId>0 → account-link -----
        if ($stateUserId === 0) {
            return $this->handleUserLogin($tokens, $profile, $base);
        }

        // ----- Upsert connected account -----
        try {
            $this->upsertAccount((int) $stateUserId, $tokens, $profile);
        } catch (\Throwable $e) {
            \Log::error('OAuth upsert account failed', ['error' => $e->getMessage()]);
            return redirect("{$base}/?oauth_error=" . urlencode('Failed to save account: ' . $e->getMessage()));
        }

        return redirect("{$base}/?account_added=true");
    }

    /**
     * User-login branch of the OAuth callback.
     *
     * 1. Find or create the local User record from the Microsoft profile.
     * 2. Upsert a connected_accounts row so the mailbox is immediately accessible
     *    without the user having to go through a separate "add account" step.
     * 3. Issue a JWT and redirect to the frontend token-landing page.
     */
    private function handleUserLogin(array $tokens, array $profile, string $base): RedirectResponse
    {
        $errorDest = rtrim(env('FRONTEND_URL', 'http://localhost:7100'), '/') . '/user/login';

        $email = strtolower(trim($profile['mail']));

        // ── 1. Find or create the local user ──────────────────────────────────
        $user = User::firstOrCreate(
            ['email' => $email],
            [
                'name'      => $profile['displayName'] ?: explode('@', $email)[0],
                'password'  => Hash::make(Str::random(40)),
                'is_admin'  => false,
                'is_active' => true,
            ]
        );

        if (! $user->is_active) {
            return redirect("{$errorDest}?oauth_error=" . urlencode('Your account has been disabled. Please contact an administrator.'));
        }

        $user->update(['last_login_at' => now()]);

        // ── 2. Upsert the connected account so the mailbox is ready immediately ─
        // This is identical to the account-link flow — tokens, expiry, primary flag.
        // If the user signs in again we simply refresh the stored tokens in place.
        try {
            $this->upsertAccount($user->id, $tokens, $profile);
        } catch (\Throwable $e) {
            // Non-fatal: the user is still authenticated even if the account row
            // fails to save. Log it and continue — the user can retry from Inbox.
            \Log::warning('handleUserLogin: failed to upsert connected account', [
                'user_id' => $user->id,
                'error'   => $e->getMessage(),
            ]);
        }

        // ── 3. Issue JWT and redirect ──────────────────────────────────────────
        $jwt      = $this->generateJwt($user);
        $userJson = base64_encode(json_encode($this->userPayload($user)));

        return redirect("{$base}/user/auth?token=" . urlencode($jwt) . '&user=' . urlencode($userJson));
    }

    // -------------------------------------------------------------------------
    // GET /api/auth/microsoft/user-login  (PUBLIC — no JWT required)
    //
    // Entry-point for regular (non-admin) users who want to sign in with Microsoft.
    // Uses the SAME redirect_uri as the account-link flow (already registered in
    // Azure) — no second redirect URI registration needed.  userId=0 in the HMAC
    // state tells callback() to run the user-login branch instead.
    // -------------------------------------------------------------------------
    public function userLoginRedirect(Request $request): RedirectResponse
    {
        $azure       = $this->azureConfig();
        $frontendUrl = rtrim(env('FRONTEND_URL', 'http://localhost:7100'), '/');

        if (empty($azure['client_id']) || empty($azure['client_secret']) || empty($azure['redirect_uri'])) {
            return redirect("{$frontendUrl}/user/login?oauth_error=" . urlencode('Microsoft sign-in is not configured. Please contact an administrator.'));
        }

        $nonce     = Str::random(32);
        $returnUrl = $this->sanitizeReturnUrl($request->query('return_url', ''));

        // userId=0 in state → callback() routes to the user-login branch.
        $state = $this->buildState(0, $nonce, $returnUrl);

        $params = [
            'client_id'     => $azure['client_id'],
            'response_type' => 'code',
            'redirect_uri'  => $azure['redirect_uri'],   // same URI already in Azure
            'response_mode' => 'query',
            'scope'         => implode(' ', Setting::getMicrosoftScopes('login')),
            'state'         => $state,
            'prompt'        => 'select_account',
        ];

        $url = "https://login.microsoftonline.com/{$azure['tenant_id']}/oauth2/v2.0/authorize?"
            . http_build_query($params);

        return redirect($url);
    }

    // -------------------------------------------------------------------------
    // POST /api/auth/microsoft/device-code/start  (JWT required)
    //
    // Initiates the OAuth 2.0 Device Authorization Grant flow.
    // Unlike the standard authorization-code flow this does NOT require the
    // user to be redirected away, needs no redirect_uri, and — crucially —
    // works for organizational (Azure AD) accounts even when the tenant admin
    // has disabled user consent for third-party apps.
    //
    // Returns: user_code, verification_uri, expires_in, interval,
    //          device_code_token (server-encrypted device_code for polling).
    // -------------------------------------------------------------------------
    public function deviceCodeStart(Request $request): JsonResponse
    {
        $azure = $this->azureConfig();

        if (empty($azure['client_id'])) {
            return response()->json([
                'error'   => 'azure_not_configured',
                'message' => 'Azure Client ID is not configured. Please fill in Settings → Azure / Microsoft OAuth.',
            ], 503);
        }

        $client = new Client([
            'timeout'     => 15,
            'handler'     => HandlerStack::create(new StreamHandler()),
            'http_errors' => false,
        ]);

        // Build the device-code request params.
        // Confidential clients (those with a client_secret) MUST include the
        // secret in this request or Microsoft returns AADSTS70002 / invalid_client.
        // Scope selection:
        //  • Authenticated (admin mail-connect) → mail scopes
        //  • Public + scope_set=mail (incremental consent upgrade) → mail scopes
        //  • Public login → login scopes (sign-in only, no mail access)
        $isMailRequest = $request->user() || $request->input('scope_set') === 'mail';
        $scopeType     = $isMailRequest ? 'mail' : 'login';

        $startParams = [
            'client_id' => $azure['client_id'],
            'scope'     => implode(' ', Setting::getMicrosoftScopes($scopeType)),
        ];
        if (!empty($azure['client_secret'])) {
            $startParams['client_secret'] = $azure['client_secret'];
        }

        try {
            $response = $client->post(
                "https://login.microsoftonline.com/{$azure['tenant_id']}/oauth2/v2.0/devicecode",
                ['form_params' => $startParams]
            );
        } catch (GuzzleException $e) {
            \Log::error('Device code start failed', ['error' => $e->getMessage()]);
            return response()->json([
                'error'   => 'request_failed',
                'message' => 'Could not reach Microsoft: ' . $e->getMessage(),
            ], 500);
        }

        $data = json_decode((string) $response->getBody(), true);

        // Microsoft returns errors in the body even on 4xx (http_errors:false)
        if (!empty($data['error'])) {
            $errDesc = $data['error_description'] ?? $data['error'];
            \Log::error('Device code start: Microsoft error', ['body' => $data]);
            return response()->json(['error' => $data['error'], 'message' => $errDesc], 500);
        }

        if (empty($data['device_code']) || empty($data['user_code'])) {
            \Log::error('Device code start: unexpected response', ['body' => $data]);
            return response()->json(['error' => 'bad_response', 'message' => 'Unexpected response from Microsoft.'], 500);
        }

        return response()->json([
            'user_code'         => $data['user_code'],
            'verification_uri'  => $data['verification_uri'],
            'expires_in'        => (int) ($data['expires_in']  ?? 900),
            'interval'          => (int) ($data['interval']    ?? 5),
            'message'           => $data['message'] ?? '',
            // Encrypt so the raw device_code never touches the browser and
            // can't be tampered with between start and poll requests.
            'device_code_token' => Crypt::encryptString($data['device_code']),
        ]);
    }

    // -------------------------------------------------------------------------
    // POST /api/auth/microsoft/device-code/poll  (JWT required)
    //
    // The frontend calls this every `interval` seconds while the user is
    // completing the sign-in on Microsoft's device-auth page.
    //
    // Returns: { status: 'pending'|'authorized'|'declined'|'expired'|'error',
    //            email?: string,   slow_down?: bool,  message?: string }
    // -------------------------------------------------------------------------
    public function deviceCodePoll(Request $request): JsonResponse
    {
        $userId         = (int) $request->input('auth_user_id');
        $encryptedToken = $request->input('device_code_token', '');

        if (empty($encryptedToken)) {
            return response()->json(['status' => 'error', 'message' => 'Missing device_code_token.'], 400);
        }

        try {
            $deviceCode = Crypt::decryptString($encryptedToken);
        } catch (\Throwable) {
            return response()->json(['status' => 'error', 'message' => 'Invalid device_code_token.'], 400);
        }

        $azure  = $this->azureConfig();
        $client = new Client([
            'timeout'     => 15,
            'handler'     => HandlerStack::create(new StreamHandler()),
            'http_errors' => false,   // handle 4xx ourselves
        ]);

        $pollParams = [
            'grant_type'  => 'urn:ietf:params:oauth:grant-type:device_code',
            'client_id'   => $azure['client_id'],
            'device_code' => $deviceCode,
        ];
        // Confidential clients must authenticate on the token endpoint too
        if (!empty($azure['client_secret'])) {
            $pollParams['client_secret'] = $azure['client_secret'];
        }

        $response = $client->post(
            "https://login.microsoftonline.com/{$azure['tenant_id']}/oauth2/v2.0/token",
            ['form_params' => $pollParams]
        );

        $data  = json_decode((string) $response->getBody(), true);
        $error = $data['error'] ?? null;

        // ── Success ────────────────────────────────────────────────────────────
        if (!empty($data['access_token'])) {
            try {
                $profile = $this->fetchMicrosoftProfile($data['access_token'], $data['id_token'] ?? null);
                $this->upsertAccount($userId, $data, $profile);
                return response()->json(['status' => 'authorized', 'email' => $profile['mail']]);
            } catch (\Throwable $e) {
                \Log::error('Device code poll: upsert failed', ['error' => $e->getMessage()]);
                return response()->json([
                    'status'  => 'error',
                    'message' => 'Authenticated but could not save account: ' . $e->getMessage(),
                ]);
            }
        }

        // ── Pending / control errors ───────────────────────────────────────────
        return match ($error) {
            'authorization_pending' => response()->json(['status' => 'pending']),
            'slow_down'             => response()->json(['status' => 'pending', 'slow_down' => true]),
            'authorization_declined'=> response()->json(['status' => 'declined']),
            'expired_token',
            'code_expired'          => response()->json(['status' => 'expired']),
            default                 => response()->json([
                'status'  => 'error',
                'message' => $data['error_description'] ?? ($error ?? 'Unknown error from Microsoft.'),
            ]),
        };
    }

    // -------------------------------------------------------------------------
    // POST /api/auth/microsoft/device-code/user-poll  (PUBLIC — no JWT)
    //
    // Same as deviceCodePoll but for the user-login page flow:
    // finds or creates the local User from the Microsoft profile,
    // upserts their connected account, and returns a signed JWT so the
    // frontend can authenticate without a page redirect.
    // -------------------------------------------------------------------------
    public function deviceCodeUserPoll(Request $request): JsonResponse
    {
        $encryptedToken = $request->input('device_code_token', '');

        if (empty($encryptedToken)) {
            return response()->json(['status' => 'error', 'message' => 'Missing device_code_token.'], 400);
        }

        try {
            $deviceCode = Crypt::decryptString($encryptedToken);
        } catch (\Throwable) {
            return response()->json(['status' => 'error', 'message' => 'Invalid device_code_token.'], 400);
        }

        $azure  = $this->azureConfig();
        $client = new Client([
            'timeout'     => 15,
            'handler'     => HandlerStack::create(new StreamHandler()),
            'http_errors' => false,
        ]);

        $pollParams = [
            'grant_type'  => 'urn:ietf:params:oauth:grant-type:device_code',
            'client_id'   => $azure['client_id'],
            'device_code' => $deviceCode,
        ];
        if (!empty($azure['client_secret'])) {
            $pollParams['client_secret'] = $azure['client_secret'];
        }

        $response = $client->post(
            "https://login.microsoftonline.com/{$azure['tenant_id']}/oauth2/v2.0/token",
            ['form_params' => $pollParams]
        );

        $data  = json_decode((string) $response->getBody(), true);
        $error = $data['error'] ?? null;

        // ── Success: find/create user, issue JWT ───────────────────────────────
        if (!empty($data['access_token'])) {
            try {
                $profile = $this->fetchMicrosoftProfile($data['access_token'], $data['id_token'] ?? null);
                $email   = strtolower(trim($profile['mail']));

                $user = User::firstOrCreate(
                    ['email' => $email],
                    [
                        'name'      => $profile['displayName'] ?: explode('@', $email)[0],
                        'password'  => Hash::make(Str::random(40)),
                        'is_admin'  => false,
                        'is_active' => true,
                    ]
                );

                if (! $user->is_active) {
                    return response()->json([
                        'status'  => 'error',
                        'message' => 'Your account has been disabled. Please contact an administrator.',
                    ]);
                }

                $user->update(['last_login_at' => now()]);

                try {
                    $this->upsertAccount($user->id, $data, $profile);
                } catch (\Throwable $e) {
                    \Log::warning('deviceCodeUserPoll: upsert failed', ['error' => $e->getMessage()]);
                }

                return response()->json([
                    'status' => 'authorized',
                    'token'  => $this->generateJwt($user),
                    'user'   => $this->userPayload($user),
                ]);
            } catch (\Throwable $e) {
                \Log::error('deviceCodeUserPoll: failed', ['error' => $e->getMessage()]);
                return response()->json(['status' => 'error', 'message' => $e->getMessage()]);
            }
        }

        return match ($error) {
            'authorization_pending'  => response()->json(['status' => 'pending']),
            'slow_down'              => response()->json(['status' => 'pending', 'slow_down' => true]),
            'authorization_declined' => response()->json(['status' => 'declined']),
            'expired_token',
            'code_expired'           => response()->json(['status' => 'expired']),
            default                  => response()->json([
                'status'  => 'error',
                'message' => $data['error_description'] ?? ($error ?? 'Unknown error from Microsoft.'),
            ]),
        };
    }

    // -------------------------------------------------------------------------
    // GET /api/auth/microsoft/admin-consent-url  (JWT + admin required)
    //
    // Returns the Microsoft admin-consent URL that an Azure AD / Microsoft 365
    // organization admin can visit once to pre-approve this app for every user
    // in their tenant. After approval, users in that org will no longer see the
    // "Admin approval required" screen when connecting their accounts.
    //
    // We target the special "organizations" pseudo-tenant so the URL works for
    // any work/school tenant. Personal Microsoft accounts never need admin
    // consent and are not affected.
    // -------------------------------------------------------------------------
    public function adminConsentUrl(): JsonResponse
    {
        $azure = $this->azureConfig();

        if (empty($azure['client_id']) || empty($azure['redirect_uri'])) {
            return response()->json([
                'error'   => 'azure_not_configured',
                'message' => 'Azure credentials are not configured in Settings.',
            ], 503);
        }

        // Admin consent is specifically for mail access — use mail_scopes so the
        // admin approves exactly the permissions users will be prompted for.
        $params = [
            'client_id'    => $azure['client_id'],
            'redirect_uri' => $azure['redirect_uri'],
            'scope'        => implode(' ', Setting::getMicrosoftScopes('mail')),
        ];

        $url = 'https://login.microsoftonline.com/organizations/v2.0/adminconsent?'
            . http_build_query($params);

        return response()->json(['url' => $url]);
    }

    // -------------------------------------------------------------------------
    // DELETE /api/accounts/{id}  (proxied here for token cleanup)
    // See AccountController — just listed for reference; actual route is there.
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // POST /api/user/upgrade-mail-access  (JWT required, any user)
    //
    // Progressive/incremental consent: the user already signed in with minimal
    // scopes (openid, offline_access, User.Read). When they first need to read
    // their inbox, the frontend calls this endpoint to silently upgrade the stored
    // refresh token to include Mail.Read — without forcing the user through any
    // new sign-in or consent UI.
    //
    // Microsoft behaviour:
    //   • Personal account / tenant that allows self-service consent →
    //     tokens upgraded silently, returns {status: "granted"}
    //   • Org tenant that requires admin consent for Mail.Read →
    //     Microsoft returns consent_required, returns {status: "consent_required"}
    //     → frontend should then show the device-code modal with mail scopes so
    //       the user (or admin) can approve once.
    // -------------------------------------------------------------------------
    public function upgradeMailAccess(Request $request): JsonResponse
    {
        $userId  = $request->input('auth_user_id');
        $account = ConnectedAccount::where('user_id', $userId)
                        ->orderByDesc('updated_at')
                        ->first();

        if (! $account || empty($account->refresh_token)) {
            return response()->json(['status' => 'no_account']);
        }

        try {
            $refreshToken = $this->encryption->decrypt($account->refresh_token);
        } catch (\Throwable) {
            return response()->json(['status' => 'no_account']);
        }

        if (empty($refreshToken)) {
            return response()->json(['status' => 'no_account']);
        }

        $azure  = $this->azureConfig();
        $client = new Client([
            'timeout'     => 15,
            'handler'     => HandlerStack::create(new StreamHandler()),
            'http_errors' => false,
        ]);

        // Attempt silent scope upgrade — use the existing refresh token to request
        // a new access token that includes Mail.Read.
        $response = $client->post(
            "https://login.microsoftonline.com/{$azure['tenant_id']}/oauth2/v2.0/token",
            ['form_params' => array_filter([
                'grant_type'    => 'refresh_token',
                'client_id'     => $azure['client_id'],
                'client_secret' => $azure['client_secret'] ?: null,
                'refresh_token' => $refreshToken,
                'scope'         => implode(' ', Setting::getMicrosoftScopes('mail')),
            ])]
        );

        $data = json_decode((string) $response->getBody(), true);

        // ── Success: store upgraded tokens and return ──────────────────────────
        if (! empty($data['access_token'])) {
            $account->update([
                'access_token'     => $this->encryption->encrypt($data['access_token']),
                'refresh_token'    => $this->encryption->encrypt($data['refresh_token'] ?? $refreshToken),
                'token_expires_at' => now()->addSeconds((int) ($data['expires_in'] ?? 3600)),
            ]);

            return response()->json(['status' => 'granted']);
        }

        // ── Consent required: admin approval or explicit user consent needed ───
        $error = $data['error'] ?? '';
        if (in_array($error, ['invalid_grant', 'interaction_required', 'consent_required'], true)
            || str_contains($data['error_description'] ?? '', 'AADSTS65001')
            || str_contains($data['error_description'] ?? '', 'consent')
        ) {
            return response()->json(['status' => 'consent_required']);
        }

        // ── Other error (e.g. refresh token expired) ───────────────────────────
        \Log::warning('upgradeMailAccess failed', ['error' => $data]);
        return response()->json([
            'status'  => 'error',
            'message' => $data['error_description'] ?? 'Token refresh failed.',
        ]);
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Exchange the authorization code for access + refresh tokens.
     *
     * @param  string|null  $redirectUri  Override the default redirect URI (e.g. user-login flow).
     * @param  bool         $mailScopes   True when exchanging a mail-connection code (uses mail_scopes).
     * @return array{access_token: string, refresh_token: string, expires_in: int}
     * @throws \RuntimeException
     */
    private function exchangeCodeForTokens(string $code, ?string $redirectUri = null, bool $mailScopes = false): array
    {
        $client = new Client([
            'timeout' => 15,
            'handler' => HandlerStack::create(new StreamHandler()),
        ]);
        $azure  = $this->azureConfig();

        $scopeType = $mailScopes ? 'mail' : 'login';

        try {
            $response = $client->post(
                "https://login.microsoftonline.com/{$azure['tenant_id']}/oauth2/v2.0/token",
                [
                    'form_params' => [
                        'grant_type'    => 'authorization_code',
                        'client_id'     => $azure['client_id'],
                        'client_secret' => $azure['client_secret'],
                        'code'          => $code,
                        'redirect_uri'  => $redirectUri ?? $azure['redirect_uri'],
                        'scope'         => implode(' ', Setting::getMicrosoftScopes($scopeType)),
                    ],
                ]
            );
        } catch (GuzzleException $e) {
            throw new \RuntimeException('HTTP error during token exchange: ' . $e->getMessage(), 0, $e);
        }

        $data = json_decode((string) $response->getBody(), true);

        if (empty($data['access_token']) || empty($data['refresh_token'])) {
            $errDesc = $data['error_description'] ?? $data['error'] ?? 'Unknown token error';
            throw new \RuntimeException($errDesc);
        }

        return $data;
    }

    /**
     * Return the signed-in user's email and display name.
     *
     * Strategy (in order — stops as soon as we have a valid email):
     *   1. Decode the OIDC id_token — zero extra HTTP round-trip, works with just
     *      openid + offline_access scopes.
     *   2. Call Graph /me — requires User.Read but is the most reliable source for
     *      organisational accounts where the UPN differs from the mailbox address.
     *
     * @return array{mail: string, displayName: string}
     */
    private function fetchMicrosoftProfile(string $accessToken, ?string $idToken = null): array
    {
        // ── 1. Try ID token claims first (no Graph API call needed) ───────────
        if ($idToken) {
            $claims = $this->decodeJwtPayload($idToken);
            // preferred_username is the UPN/email for both personal and org accounts.
            $email = $claims['preferred_username'] ?? $claims['email'] ?? null;
            if (!empty($email) && str_contains($email, '@')) {
                return [
                    'mail'        => strtolower(trim($email)),
                    'displayName' => $claims['name'] ?? explode('@', $email)[0],
                ];
            }
        }

        // ── 2. Fall back to Graph /me (User.Read scope required) ──────────────
        $client = new Client([
            'timeout'     => 10,
            'http_errors' => false,
            'handler'     => HandlerStack::create(new StreamHandler()),
        ]);

        try {
            $response = $client->get('https://graph.microsoft.com/v1.0/me', [
                'headers' => [
                    'Authorization' => "Bearer {$accessToken}",
                    'Accept'        => 'application/json',
                ],
            ]);
        } catch (GuzzleException $e) {
            throw new \RuntimeException('HTTP error fetching profile: ' . $e->getMessage(), 0, $e);
        }

        $profile = json_decode((string) $response->getBody(), true);

        // Graph returns `mail` for mailboxes and `userPrincipalName` as fallback.
        $email = $profile['mail'] ?? $profile['userPrincipalName'] ?? null;

        if (empty($email)) {
            throw new \RuntimeException('Could not determine the user\'s email address from Microsoft.');
        }

        return [
            'mail'        => strtolower(trim($email)),
            'displayName' => $profile['displayName'] ?? '',
        ];
    }

    /**
     * Decode the payload section of a JWT without verifying the signature.
     * We trust the token because it came directly from Microsoft's token endpoint
     * over HTTPS — signature verification would require fetching Microsoft's JWKS
     * which is an unnecessary round-trip for our use-case.
     */
    private function decodeJwtPayload(string $jwt): array
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            return [];
        }
        // Base64url → base64 → decode
        $payload = base64_decode(strtr($parts[1], '-_', '+/') . str_repeat('=', (4 - strlen($parts[1]) % 4) % 4));
        return json_decode($payload, true) ?? [];
    }

    /**
     * Build a stateless, tamper-proof OAuth state parameter.
     *
     * Format: base64url(userId:nonce:returnUrl) + "." + HMAC-SHA256(payload, APP_KEY)
     *
     * Self-contained — carries the user ID and optional return URL so the callback
     * needs no server session and can redirect to the correct frontend app.
     */
    private function buildState(int $userId, string $nonce, string $returnUrl = ''): string
    {
        $payload = $userId . ':' . $nonce . ':' . $returnUrl;
        $sig     = hash_hmac('sha256', $payload, config('app.key'));

        return rtrim(strtr(base64_encode($payload), '+/', '-_'), '=') . '.' . $sig;
    }

    /**
     * Verify the state and return [userId, returnUrl], or [null, ''] on failure.
     *
     * @param  bool  $allowAnon  When true, userId=0 is considered valid (user-login flow).
     * @return array{int|null, string}
     */
    private function verifyState(string $state, bool $allowAnon = false): array
    {
        $dot = strrpos($state, '.');
        if ($dot === false) {
            return [null, ''];
        }

        $encoded = substr($state, 0, $dot);
        $sig     = substr($state, $dot + 1);

        $payload = base64_decode(strtr($encoded, '-_', '+/') . str_repeat('=', (4 - strlen($encoded) % 4) % 4));

        if ($payload === false || !str_contains($payload, ':')) {
            return [null, ''];
        }

        $expectedSig = hash_hmac('sha256', $payload, config('app.key'));
        if (!hash_equals($expectedSig, $sig)) {
            return [null, ''];
        }

        $parts     = explode(':', $payload, 3);
        $userId    = (int) $parts[0];
        $returnUrl = $parts[2] ?? '';

        if ($userId > 0) return [$userId, $returnUrl];
        if ($allowAnon && $userId === 0) return [0, $returnUrl];

        return [null, ''];
    }

    /**
     * Validate a return_url against the FRONTEND_URLS whitelist to prevent
     * open-redirect attacks. Returns the URL if safe, empty string otherwise.
     */
    private function sanitizeReturnUrl(string $url): string
    {
        if (empty($url)) {
            return '';
        }

        $allowed = array_filter(array_map(
            'trim',
            explode(',', env('FRONTEND_URLS', env('FRONTEND_URL', '')))
        ));

        foreach ($allowed as $allowedOrigin) {
            $allowedOrigin = rtrim($allowedOrigin, '/');
            if (str_starts_with($url, $allowedOrigin)) {
                return $url;
            }
        }

        return '';
    }

    /**
     * Issue a signed JWT for the given user (mirrors AuthController::generateJwt).
     */
    private function generateJwt(User $user): string
    {
        $secret = config('app.jwt_secret') ?? env('JWT_SECRET');
        $ttl    = (int) (config('app.jwt_ttl_minutes') ?? env('JWT_TTL_MINUTES', 1440));
        $now    = time();

        return JWT::encode([
            'iss' => config('app.url'),
            'iat' => $now,
            'exp' => $now + ($ttl * 60),
            'sub' => $user->id,
        ], $secret, 'HS256');
    }

    /**
     * Return the public user payload array (mirrors AuthController::userPayload).
     */
    private function userPayload(User $user): array
    {
        return [
            'id'            => $user->id,
            'name'          => $user->name,
            'email'         => $user->email,
            'is_admin'      => (bool) $user->is_admin,
            'is_active'     => (bool) $user->is_active,
            'last_login_at' => $user->last_login_at?->toISOString(),
            'created_at'    => $user->created_at?->toISOString(),
        ];
    }

    /**
     * Insert or update the connected_accounts row.
     * If the user already has this email linked, we silently update the tokens
     * (e.g. re-consent after token revocation).
     */
    private function upsertAccount(int $userId, array $tokens, array $profile): ConnectedAccount
    {
        $encryptedAccess  = $this->encryption->encrypt($tokens['access_token']);
        $encryptedRefresh = $this->encryption->encrypt($tokens['refresh_token']);
        $expiresAt        = now()->addSeconds((int) ($tokens['expires_in'] ?? 3600));

        // One Outlook email = one row, regardless of which local user it's linked to.
        // If the same email was previously connected under a different user ID
        // (e.g. admin connected it manually, then the real owner signed in via
        // device code), we update the existing row in place so no duplicates form.
        $existing  = ConnectedAccount::where('email', $profile['mail'])->orderByDesc('updated_at')->first();
        $isPrimary = $existing
            ? $existing->is_primary   // preserve existing primary flag
            : !ConnectedAccount::where('user_id', $userId)->exists();

        $account = ConnectedAccount::updateOrCreate(
            ['email' => $profile['mail']],   // match on email only
            [
                'user_id'          => $userId,
                'display_name'     => $profile['displayName'],
                'access_token'     => $encryptedAccess,
                'refresh_token'    => $encryptedRefresh,
                'token_expires_at' => $expiresAt,
                'is_primary'       => $isPrimary,
            ]
        );

        // Remove any stale duplicate rows for the same email that existed
        // before this deduplication logic was introduced.
        ConnectedAccount::where('email', $profile['mail'])
            ->where('id', '!=', $account->id)
            ->delete();

        return $account;
    }
}
