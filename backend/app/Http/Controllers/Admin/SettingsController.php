<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ConnectedAccount;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    // Keys whose raw values should be masked in the API response so secrets
    // are never sent to the browser in plain text.
    private const SECRET_KEYS = ['azure_client_secret'];

    // =========================================================================
    // GET /api/settings/login-page  (PUBLIC — no auth required)
    // Returns the login_page group as a flat key → value map so the user-login
    // page can fetch its appearance without a JWT token.
    // =========================================================================
    public function loginPage(): JsonResponse
    {
        $defaults = [
            'login_page_title'        => 'Sign in',
            'login_page_subtitle'     => 'Use your Outlook account to continue',
            'login_page_badge_text'   => 'OUTLOOK MAIL',
            'login_page_button_text'  => 'Sign in with Microsoft',
            'login_page_step1_label'  => 'Step 1 — Copy this code',
            'login_page_step2_label'  => 'Step 2 — Open this page',
            'login_page_waiting_text' => 'Waiting for sign-in…',
            'login_page_footer_text'  => 'Your Outlook email and display name will be used as your account details. No separate password required.',
            'login_page_bg_color'     => '#0f0f1a',
            'login_page_card_color'   => '#1a1a2e',
            'login_page_accent_color' => '#0078d4',
            'login_page_logo_url'          => '',
            'login_page_auto_open_link'    => '1',
        ];

        $rows = Setting::where('group', 'login_page')->get()
            ->mapWithKeys(fn ($s) => [$s->key => $s->value ?? ''])
            ->toArray();

        // Merge DB values over defaults so even if the migration hasn't run
        // the endpoint always returns a usable response.
        return response()->json(['settings' => array_merge($defaults, $rows)]);
    }

    // =========================================================================
    // GET /api/admin/settings
    // Returns all settings grouped by their group key.
    // =========================================================================
    public function index(): JsonResponse
    {
        $settings = Setting::orderBy('group')->orderBy('key')->get();

        $grouped = $settings->groupBy('group')->map(fn ($group) =>
            $group->map(fn ($s) => [
                'id'          => $s->id,
                'key'         => $s->key,
                'value'       => $s->typedValue(),
                'raw_value'   => in_array($s->key, self::SECRET_KEYS)
                                    ? ($s->value ? '••••••••' : '')
                                    : $s->value,
                'type'        => $s->type,
                'description' => $s->description,
                'is_secret'   => in_array($s->key, self::SECRET_KEYS),
                'is_set'      => in_array($s->key, self::SECRET_KEYS) ? !empty($s->value) : null,
            ])->values()
        );

        return response()->json(['settings' => $grouped]);
    }

    // =========================================================================
    // PATCH /api/admin/settings
    // Body: { "settings": { "allow_registration": true, "app_name": "..." } }
    // =========================================================================
    public function update(Request $request): JsonResponse
    {
        $input = $request->validate([
            'settings'   => 'required|array',
            'settings.*' => 'present',
        ]);

        $updated = [];
        $errors  = [];

        foreach ($input['settings'] as $key => $value) {
            $setting = Setting::where('key', $key)->first();

            if ($setting === null) {
                $errors[$key] = "Unknown setting key: {$key}";
                continue;
            }

            // Skip masked placeholder values for secret fields — they represent
            // "no change" rather than an actual new value the admin typed.
            if (in_array($key, self::SECRET_KEYS) && $value === '••••••••') {
                continue;
            }

            // Type-safe coercion
            $coerced = match ($setting->type) {
                'boolean' => filter_var($value, FILTER_VALIDATE_BOOLEAN) ? '1' : '0',
                'integer' => (string)(int) $value,
                'json'    => is_array($value) ? json_encode($value) : $value,
                default   => (string) $value,
            };

            $setting->update(['value' => $coerced, 'updated_at' => now()]);
            $updated[$key] = $setting->fresh()->typedValue();
        }

        if (!empty($errors)) {
            return response()->json([
                'error'   => 'partial_update',
                'message' => 'Some settings could not be updated.',
                'errors'  => $errors,
                'updated' => $updated,
            ], 422);
        }

        return response()->json([
            'message' => 'Settings saved successfully.',
            'updated' => $updated,
        ]);
    }

    // =========================================================================
    // POST /api/admin/settings/reset  — restore all defaults
    // =========================================================================
    public function reset(): JsonResponse
    {
        $defaults = [
            'app_name'                   => 'Mail Manager',
            'allow_registration'         => '1',
            'maintenance_mode'           => '0',
            'max_accounts_per_user'      => '10',
            'allowed_email_domains'      => '',
            'emails_per_sync'            => '50',
            'cache_email_bodies'         => '1',
            'jwt_ttl_minutes'            => '1440',
            'require_email_verification' => '0',
            'admin_email'                => '',
            // Login page appearance
            'login_page_title'           => 'Sign in',
            'login_page_subtitle'        => 'Use your Outlook account to continue',
            'login_page_badge_text'      => 'OUTLOOK MAIL',
            'login_page_button_text'     => 'Sign in with Microsoft',
            'login_page_step1_label'     => 'Step 1 — Copy this code',
            'login_page_step2_label'     => 'Step 2 — Open this page',
            'login_page_waiting_text'    => 'Waiting for sign-in…',
            'login_page_footer_text'     => 'Your Outlook email and display name will be used as your account details. No separate password required.',
            'login_page_bg_color'        => '#0f0f1a',
            'login_page_card_color'      => '#1a1a2e',
            'login_page_accent_color'    => '#0078d4',
            'login_page_logo_url'        => '',
            'login_page_auto_open_link'  => '1',
            // Microsoft OAuth scopes — reset to safe minimal defaults
            'microsoft_login_scopes'     => '["openid","offline_access","User.Read"]',
            'microsoft_mail_scopes'      => '["openid","offline_access","User.Read","Mail.Read"]',
            // Azure credentials are intentionally NOT reset — they are
            // environment-specific secrets and resetting them would break OAuth.
        ];

        foreach ($defaults as $key => $value) {
            Setting::where('key', $key)->update(['value' => $value, 'updated_at' => now()]);
        }

        return response()->json(['message' => 'All settings have been reset to defaults.']);
    }

    // =========================================================================
    // GET /api/admin/settings/oauth-accounts — Get available OAuth Manual accounts
    // =========================================================================
    public function getOAuthAccounts(): JsonResponse
    {
        $accounts = ConnectedAccount::where('connection_type', 'oauth_manual')
            ->select('id', 'email', 'display_name', 'oauth_client_id', 'oauth_tenant_id')
            ->orderBy('email')
            ->get()
            ->map(fn ($a) => [
                'id'             => $a->id,
                'email'          => $a->email,
                'display_name'   => $a->display_name,
                'client_id'      => $a->oauth_client_id,
                'tenant_id'      => $a->oauth_tenant_id,
            ]);

        $default = Setting::first()?->default_oauth_account_id;

        return response()->json([
            'accounts' => $accounts,
            'default_account_id' => $default,
        ]);
    }

    // =========================================================================
    // PATCH /api/admin/settings/default-oauth-account
    // Body: { "account_id": 5 } or { "account_id": null } to clear
    // =========================================================================
    public function setDefaultOAuthAccount(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'account_id' => 'nullable|exists:connected_accounts,id',
        ]);

        $accountId = $validated['account_id'];

        // Verify it's an oauth_manual account if not null
        if ($accountId) {
            $account = ConnectedAccount::find($accountId);
            if ($account?->connection_type !== 'oauth_manual') {
                return response()->json([
                    'error'   => 'invalid_account',
                    'message' => 'Only OAuth Manual accounts can be used as default.',
                ], 422);
            }
        }

        // Update the first (and usually only) settings record
        $setting = Setting::first();
        if ($setting) {
            $setting->update(['default_oauth_account_id' => $accountId]);
        }

        return response()->json([
            'message' => $accountId ? "Default OAuth account set to: {$account->email}" : 'Default OAuth account cleared.',
            'default_account_id' => $accountId,
        ]);
    }

    // =========================================================================
    // GET /api/admin/settings/microsoft-scopes
    // Returns the current Microsoft OAuth scopes configured in the system
    // =========================================================================
    public function getMicrosoftScopes(): JsonResponse
    {
        $scopes = config('microsoft.mail_scopes', [
            'openid',
            'offline_access',
            'User.Read',
            'Mail.Read',
            'MailboxSettings.ReadWrite',
        ]);

        return response()->json(['scopes' => $scopes]);
    }
}
