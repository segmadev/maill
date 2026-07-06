<?php

use App\Http\Controllers\AccountController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\MailController as AdminMailController;
use App\Http\Controllers\Admin\SettingsController;
use App\Http\Controllers\Admin\UserController as AdminUserController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BulkEmailController;
use App\Http\Controllers\BulkCampaignController;
use App\Http\Controllers\BulkMailController;
use App\Http\Controllers\DraftController;
use App\Http\Controllers\GraphAPILogController;
use App\Http\Controllers\WebhookController;
use App\Http\Controllers\EmailController;
use App\Http\Controllers\FolderController;
use App\Http\Controllers\KeywordController;
use App\Http\Controllers\MicrosoftOAuthController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\EmailHealthController;
use App\Http\Controllers\RuleController;
use App\Http\Controllers\AlertController;
use App\Http\Controllers\SignatureManagementController;
use App\Http\Controllers\LogController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
| JwtMiddleware     → validates Bearer token, sets auth_user_id on request
| TokenRefreshMiddleware → proactively refreshes near-expired MS tokens
*/

// ----- Public settings routes (no JWT required) -----
// Exposes only the login_page group so the user login page can fetch its
// appearance without an authenticated session.
Route::get('/settings/login-page', [SettingsController::class, 'loginPage']);
Route::get('/settings/microsoft-scopes', [SettingsController::class, 'getMicrosoftScopes']);

// ----- Public auth routes (no JWT required) -----
Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login',    [AuthController::class, 'login']);

    // OAuth callback is called by Microsoft's redirect — must be public.
    Route::get('/microsoft/callback', [MicrosoftOAuthController::class, 'callback']);

    // OAuth Authorization Code Flow callback (admin account connection)
    Route::get('/microsoft/oauth-callback', [\App\Http\Controllers\OAuthAuthorizationController::class, 'handleAuthorizationCallback']);

    // User sign-in with Microsoft (no existing account required).
    Route::get('/microsoft/user-login', [MicrosoftOAuthController::class, 'userLoginRedirect']);

    // Device code flow — user-login variant (no JWT, creates/finds user, returns JWT).
    // The /start reuses the same method as the admin connect flow.
    Route::post('/microsoft/device-code/user-start', [MicrosoftOAuthController::class, 'deviceCodeStart']);
    Route::post('/microsoft/device-code/user-poll',  [MicrosoftOAuthController::class, 'deviceCodeUserPoll']);
});

// ----- Protected routes — require valid JWT -----
Route::middleware('jwt')->group(function () {

    // Token Refresh (separate from token.refresh middleware to avoid cascading middleware issues)
    Route::options('/accounts/{id}/refresh', function () {
        return response()->noContent()
            ->header('Access-Control-Allow-Origin', request()->header('Origin') ?? '*')
            ->header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            ->header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            ->header('Access-Control-Allow-Credentials', 'true')
            ->header('Access-Control-Max-Age', '86400');
    });
    Route::post('/accounts/{id}/refresh', [AccountController::class, 'refresh']);

    // Current user info + profile update
    Route::get('/auth/me',        [AuthController::class, 'me']);
    Route::patch('/auth/profile', [AuthController::class, 'updateProfile']);

    // Microsoft OAuth — initiate flow (user must be logged in first)
    Route::get('/auth/microsoft/redirect',           [MicrosoftOAuthController::class, 'redirect']);

    // Device Code flow — works for org accounts that block standard consent
    Route::post('/auth/microsoft/device-code/start', [MicrosoftOAuthController::class, 'deviceCodeStart']);
    Route::post('/auth/microsoft/device-code/poll',  [MicrosoftOAuthController::class, 'deviceCodePoll']);

    // Generate the admin-consent URL so an org admin can pre-approve the app.
    Route::get('/auth/microsoft/admin-consent-url',  [MicrosoftOAuthController::class, 'adminConsentUrl']);

    // Progressive consent: silently upgrade the stored refresh token to include
    // Mail.Read when the user first accesses their inbox — no re-auth needed.
    Route::post('/user/upgrade-mail-access', [MicrosoftOAuthController::class, 'upgradeMailAccess']);

    // ── Drafts (no Graph API — pure DB) ──────────────────────────────────────
    Route::get('/drafts',           [DraftController::class, 'index']);
    Route::post('/drafts',          [DraftController::class, 'store']);
    Route::patch('/drafts/{id}',    [DraftController::class, 'update']);
    Route::delete('/drafts/{id}',   [DraftController::class, 'destroy']);

    // ── Keywords + smart-label matches (queries cached email DB) ─────────────
    // NOTE: /keywords/matches must be registered before /keywords/{id} to
    // prevent Laravel from treating "matches" as an {id} parameter.
    Route::get('/keywords/matches',   [KeywordController::class, 'matches']);
    Route::get('/keywords',           [KeywordController::class, 'index']);
    Route::post('/keywords',          [KeywordController::class, 'store']);
    Route::patch('/keywords/{id}',    [KeywordController::class, 'update']);
    Route::delete('/keywords/{id}',   [KeywordController::class, 'destroy']);

    // ── Bulk mail: parse is stateless ────────────────────────────────────────
    Route::post('/bulk/parse',      [BulkMailController::class, 'parse']);

    // ── Bulk email campaigns ─────────────────────────────────────────────────
    Route::get('/bulk-email-campaigns/{id}/allocation-breakdown', [BulkEmailController::class, 'getAllocationBreakdown']);

    // Routes that may call Graph API get automatic token refresh
    // List accounts without token refresh middleware (just checking status)
    Route::get('/accounts', [AccountController::class, 'index']);

    // Signature endpoints (requires token refresh for Graph API access)
    Route::middleware('token.refresh')->group(function () {
        Route::get('/accounts/{id}/signature', [\App\Http\Controllers\SignatureController::class, 'getSignature']);
    });

    Route::middleware('token.refresh')->group(function () {

        // Connected accounts
        Route::delete('/accounts/{id}',           [AccountController::class, 'destroy']);

        // Folders per account
        Route::get('/accounts/{id}/folders', [FolderController::class, 'index']);

        // Email list per account + folder
        Route::get('/accounts/{id}/emails',  [EmailController::class, 'index']);

        // Single email (cache-first)
        Route::get('/emails/{id}',           [EmailController::class, 'show']);

        // Send new email
        Route::post('/emails/send',          [EmailController::class, 'send']);

        // Mutations
        Route::patch('/emails/{id}/read',    [EmailController::class, 'markRead']);
        Route::patch('/emails/{id}/flag',    [EmailController::class, 'flag']);
        Route::post('/emails/{id}/move',     [EmailController::class, 'move']);
        Route::delete('/emails/{id}',        [EmailController::class, 'destroy']);
        Route::post('/emails/{id}/reply',    [EmailController::class, 'reply']);
        Route::post('/emails/{id}/forward',  [EmailController::class, 'forward']);

        // Attachments
        Route::get('/emails/{id}/attachments', [EmailController::class, 'attachments']);

        // Cross-account search
        Route::get('/search', [SearchController::class, 'search']);
    });

    // =========================================================================
    // Admin routes — jwt + admin middleware
    // =========================================================================
    Route::prefix('admin')->middleware('admin')->group(function () {

        // Bulk email campaigns — admin only
        Route::post('/bulk-campaigns',                    [BulkCampaignController::class, 'store']);
        Route::get('/bulk-campaigns',                     [BulkCampaignController::class, 'index']);
        Route::get('/bulk-campaigns/{id}',                [BulkCampaignController::class, 'show']);
        Route::patch('/bulk-campaigns/{id}',              [BulkCampaignController::class, 'update']);
        Route::delete('/bulk-campaigns/{id}',             [BulkCampaignController::class, 'destroy']);
        Route::post('/bulk-campaigns/{id}/start',         [BulkCampaignController::class, 'start']);
        Route::post('/bulk-campaigns/{id}/pause',         [BulkCampaignController::class, 'pause']);
        Route::post('/bulk-campaigns/{id}/cancel',        [BulkCampaignController::class, 'cancel']);
        Route::post('/bulk-campaigns/{id}/update-batch',  [BulkCampaignController::class, 'updateBatch']);
        Route::post('/bulk-campaigns/{id}/update-recipient-tracking', [BulkCampaignController::class, 'updateRecipientTracking']);
        Route::post('/bulk-campaigns/{id}/resend-recipients', [BulkCampaignController::class, 'resendRecipients']);
        Route::post('/bulk-campaigns/{id}/resend-batch',     [BulkCampaignController::class, 'resendBatch']);
        Route::post('/bulk-campaigns/{id}/replay',           [BulkCampaignController::class, 'replay']);

        // Graph API Logs — debugging, admin only
        Route::get('/logs/graph-api',                     [GraphAPILogController::class, 'getLogs']);
        Route::get('/logs/graph-api/download',            [GraphAPILogController::class, 'downloadLogs']);
        Route::post('/logs/graph-api/clear',              [GraphAPILogController::class, 'clearLogs']);

        // Bulk send — admin only, uses any connected account
        Route::middleware('token.refresh')->group(function () {
            Route::post('/bulk/send', [BulkMailController::class, 'send']);
        });

        // Account connections — admin only
        Route::post('/accounts/oauth-manual/start',               [AccountController::class, 'startOAuthManualDeviceCode']);
        Route::post('/accounts/oauth-manual/poll',                [AccountController::class, 'pollOAuthManualDeviceCode']);

        // OAuth Authorization Code Flow (default option)
        Route::post('/accounts/oauth-authorize/start',            [\App\Http\Controllers\OAuthAuthorizationController::class, 'startAuthorization']);
        Route::post('/accounts/oauth-authorize/complete',         [\App\Http\Controllers\OAuthAuthorizationController::class, 'completeAuthorization']);
        Route::get('/oauth-status',                               [\App\Http\Controllers\OAuthAuthorizationController::class, 'checkOAuthStatus']);

        // Manual token refresh (works anytime)
        Route::post('/accounts/{id}/refresh-token',               [\App\Http\Controllers\OAuthAuthorizationController::class, 'refreshToken']);

        // ── Signature Management ──────────────────────────────────────────
        Route::get('/signature-templates',                          [\App\Http\Controllers\SignatureManagementController::class, 'listTemplates']);
        Route::get('/signatures',                                   [\App\Http\Controllers\SignatureManagementController::class, 'listSignatures']);
        Route::post('/signatures',                                  [\App\Http\Controllers\SignatureManagementController::class, 'createSignature']);
        Route::get('/signatures/{id}',                              [\App\Http\Controllers\SignatureManagementController::class, 'getSignature']);
        Route::put('/signatures/{id}',                              [\App\Http\Controllers\SignatureManagementController::class, 'updateSignature']);
        Route::delete('/signatures/{id}',                           [\App\Http\Controllers\SignatureManagementController::class, 'deleteSignature']);
        Route::post('/signatures/{id}/render',                      [\App\Http\Controllers\SignatureManagementController::class, 'renderSignature']);
        Route::get('/accounts/{id}/signatures',                     [\App\Http\Controllers\SignatureManagementController::class, 'getAccountSignatures']);
        Route::post('/accounts/{id}/assign-signature',              [\App\Http\Controllers\SignatureManagementController::class, 'assignSignatureToAccount']);
        Route::delete('/accounts/{id}/unassign-signature',            [\App\Http\Controllers\SignatureManagementController::class, 'unassignSignatureFromAccount']);

        // ── Outlook Rules ──────────────────────────────────────────────────
        Route::get('/accounts/{accountId}/rules',                    [RuleController::class, 'listByAccount']);
        Route::post('/accounts/{accountId}/rules',                   [RuleController::class, 'store']);
        Route::get('/accounts/{accountId}/rules/{ruleId}',           [RuleController::class, 'show']);
        Route::patch('/accounts/{accountId}/rules/{ruleId}',         [RuleController::class, 'update']);
        Route::delete('/accounts/{accountId}/rules/{ruleId}',        [RuleController::class, 'destroy']);
        Route::post('/accounts/{accountId}/rules/{ruleId}/toggle',   [RuleController::class, 'toggleEnabled']);
        Route::post('/accounts/{accountId}/rules/sync',              [RuleController::class, 'syncWithOutlook']);
        Route::get('/accounts/{accountId}/folders',                  [RuleController::class, 'getFolders']);

        // ── Email Health & Deliverability ──────────────────────────────────
        Route::post('/email-health/check',                  [EmailHealthController::class, 'check']);
        Route::get('/email-health/warmup-status/{accountId}',  [EmailHealthController::class, 'warmupStatus']);
        Route::post('/email-health/check-rate-limit',       [EmailHealthController::class, 'checkRateLimit']);
        Route::get('/email-health/sender-reputation/{accountId}', [EmailHealthController::class, 'senderReputation']);
        Route::get('/email-health/bounce-report/{accountId}',  [EmailHealthController::class, 'bounceReport']);
        Route::get('/email-health/complaint-report/{accountId}', [EmailHealthController::class, 'complaintReport']);
        Route::get('/email-health/suppression-list/{accountId}', [EmailHealthController::class, 'suppressionList']);

        // ── Alerts ─────────────────────────────────────────────────────────
        Route::get('/alerts/{accountId}/active',            [\App\Http\Controllers\AlertController::class, 'getActiveAlerts']);
        Route::get('/alerts/{accountId}/history',           [\App\Http\Controllers\AlertController::class, 'getAlertHistory']);
        Route::get('/alerts/{accountId}/stats',             [\App\Http\Controllers\AlertController::class, 'getAlertStats']);
        Route::get('/alerts/{accountId}/preferences',       [\App\Http\Controllers\AlertController::class, 'getPreferences']);
        Route::patch('/alerts/{accountId}/preferences',     [\App\Http\Controllers\AlertController::class, 'updatePreferences']);
        Route::post('/alerts/{accountId}/check',            [\App\Http\Controllers\AlertController::class, 'checkAccountHealth']);
        Route::post('/alerts/{alertId}/resolve',            [\App\Http\Controllers\AlertController::class, 'resolveAlert']);
        Route::post('/alerts/{alertId}/dismiss',            [\App\Http\Controllers\AlertController::class, 'dismissAlert']);

        Route::post('/accounts/{id}/renew-refresh-token',         [AccountController::class, 'renewRefreshToken']);
        Route::post('/accounts/renew-refresh-token/poll',         [AccountController::class, 'pollRenewRefreshToken']);
        Route::post('/accounts/connect/smtp',                     [AccountController::class, 'connectSmtp']);
        Route::post('/accounts/test-smtp',                        [AccountController::class, 'testSmtp']);
        Route::patch('/accounts/{id}/update-smtp',                [AccountController::class, 'updateSmtp']);
        Route::patch('/accounts/{id}/priority',                   [AccountController::class, 'updatePriority']);

        // Dashboard stats
        Route::get('/dashboard', [DashboardController::class, 'index']);

        // User management
        Route::get('/users',                               [AdminUserController::class, 'index']);
        Route::post('/users',                              [AdminUserController::class, 'store']);
        Route::get('/users/{id}',                          [AdminUserController::class, 'show']);
        Route::patch('/users/{id}',                        [AdminUserController::class, 'update']);
        Route::delete('/users/{id}',                       [AdminUserController::class, 'destroy']);
        Route::post('/users/{id}/toggle-active',           [AdminUserController::class, 'toggleActive']);
        Route::post('/users/{id}/toggle-admin',            [AdminUserController::class, 'toggleAdmin']);
        Route::delete('/users/{userId}/accounts/{accountId}', [AdminUserController::class, 'destroyAccount']);

        // Mail & account oversight
        Route::get('/mails',                              [AdminMailController::class, 'index']);
        Route::get('/mails/{id}',                         [AdminMailController::class, 'show']);
        Route::delete('/mails/{id}',                      [AdminMailController::class, 'destroy']);
        Route::get('/accounts',                           [AdminMailController::class, 'accounts']);
        Route::delete('/accounts/{id}',                   [AdminMailController::class, 'destroyAccount']);
        Route::get('/accounts/{id}/extract-emails',       [AdminMailController::class, 'extractEmails']);

        // App settings
        Route::get('/settings',                           [SettingsController::class, 'index']);
        Route::patch('/settings',                         [SettingsController::class, 'update']);
        Route::post('/settings/reset',                    [SettingsController::class, 'reset']);
        Route::get('/settings/oauth-accounts',            [SettingsController::class, 'getOAuthAccounts']);
        Route::patch('/settings/default-oauth-account',   [SettingsController::class, 'setDefaultOAuthAccount']);

        // ── Logs ──────────────────────────────────────────────────────────────────
        Route::get('/logs',                                 [LogController::class, 'listLogs']);
        Route::get('/logs/{filename}',                      [LogController::class, 'getLog']);
        Route::delete('/logs/{filename}',                   [LogController::class, 'clearLog']);
        Route::delete('/logs',                              [LogController::class, 'clearAllLogs']);
        Route::get('/logs/{filename}/download',             [LogController::class, 'downloadLog']);

        // Testing endpoints
        Route::post('/webhooks/simulate-bounce',           [WebhookController::class, 'simulateBounce']);
        Route::post('/webhooks/simulate-complaint',        [WebhookController::class, 'simulateComplaint']);
    });

    // ── Webhooks (Public) ──────────────────────────────────────────────────────
    Route::post('/webhooks/delivery', [WebhookController::class, 'handleDeliveryNotification']);
});

// ── Email Delivery Webhooks (Public) ────────────────────────────────────────────
// Handle bounce and complaint notifications from email providers
Route::post('/webhooks/sendgrid', [\App\Http\Controllers\DeliveryWebhookController::class, 'sendgrid']);
Route::post('/webhooks/mailgun', [\App\Http\Controllers\DeliveryWebhookController::class, 'mailgun']);
Route::post('/webhooks/aws-ses', [\App\Http\Controllers\DeliveryWebhookController::class, 'awsSes']);
Route::post('/webhooks/microsoft', [\App\Http\Controllers\DeliveryWebhookController::class, 'microsoft']);
Route::post('/webhooks/generic', [\App\Http\Controllers\DeliveryWebhookController::class, 'generic']);
