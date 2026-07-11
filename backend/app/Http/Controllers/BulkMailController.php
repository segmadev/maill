<?php

namespace App\Http\Controllers;

use App\Models\ConnectedAccount;
use App\Models\EmailSignature;
use App\Services\GraphApiService;
use App\Services\TokenEncryptionService;
use App\Services\SignatureService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BulkMailController extends Controller
{
    public function __construct(
        private GraphApiService        $graph,
        private TokenEncryptionService $encryption,
    ) {}

    /**
     * POST /api/bulk/parse
     *
     * Upload a CSV / plain-text file and return all valid email addresses found
     * inside it.  Used by the legacy plain-text import path.
     */
    public function parse(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|mimes:csv,txt|max:5120',
        ]);

        $contents = file_get_contents($request->file('file')->getPathname());

        preg_match_all('/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/', $contents, $matches);
        $emails = array_values(array_unique($matches[0]));

        return response()->json(['emails' => $emails, 'count' => count($emails)]);
    }

    /**
     * POST /api/admin/bulk/send
     *
     * Send one personalised email per recipient.
     *
     * Recipient format — each item in the `recipients` array may be:
     *
     *   (a) A plain string:           "user@example.com"
     *       → uses the top-level `subject` and `body` fields.
     *
     *   (b) An object with resolved fields:
     *       { "email": "user@example.com", "subject": "…", "body": "…" }
     *       → per-recipient subject/body take priority; falls back to top-level.
     *
     * Templates are resolved on the frontend before this endpoint is called,
     * so no server-side variable substitution is needed.
     */
    public function send(Request $request): JsonResponse
    {
        $accountId  = (int) $request->input('account_id');
        $recipients = $request->input('recipients', []);

        // Global fallback subject/body (used when recipient is a plain string)
        $globalSubject = trim($request->input('subject', ''));
        $globalBody    = $request->input('body', '');

        // Campaign settings
        $campaignSettings = [
            'markAsImportant' => (bool) $request->input('markAsImportant', false),
            'emailsPerHour' => (int) $request->input('emailsPerHour', 50),
            'dailyLimit' => (int) $request->input('dailyLimit', 500),
            'ipRotation' => $request->input('ipRotation', 'reputation'),
            'enableIpWarmup' => (bool) $request->input('enableIpWarmup', false),
            'signature_id' => $request->input('signature_id'),
            'include_signature' => (bool) $request->input('include_signature', true),
        ];

        if (empty($recipients)) {
            return response()->json(['error' => 'No recipients provided.'], 422);
        }

        // Admin panel: any connected account may be used — no user_id restriction.
        $account = ConnectedAccount::find($accountId);
        // die(var_dump("ACCOUNT: ", $account));
        //   return response()->json(['error' => 'Got here'.var_dump("ACCOUNT: ", $account, $campaignSettings)], 404);
        if (! $account) {
            return response()->json(['error' => 'Account not found.'], 404);
        }

        // Handle SMTP vs OAuth accounts differently
        if ($account->connection_type === 'smtp') {
            return $this->sendViaSMTP($account, $recipients, $globalSubject, $globalBody, $campaignSettings);
        } else {
            return $this->sendViaGraph($account, $recipients, $globalSubject, $globalBody, $campaignSettings);
        }
    }

    /**
     * Send bulk emails via SMTP
     */
    private function sendViaSMTP($account, $recipients, $globalSubject, $globalBody, $campaignSettings = []): JsonResponse
    {
        $sent   = 0;
        $failed = [];

        try {
            $smtpCreds = json_decode($this->encryption->decrypt($account->smtp_credentials), true);

            if (!$smtpCreds) {
                return response()->json([
                    'error' => 'smtp_error',
                    'message' => 'Invalid SMTP credentials',
                ], 422);
            }

            $smtpService = new \App\Services\SmtpService();

            foreach ($recipients as $recipient) {
                // Normalise to array
                if (is_string($recipient)) {
                    $email   = trim($recipient);
                    $subject = $globalSubject;
                    $body    = $globalBody;
                } else {
                    $email   = trim($recipient['email'] ?? '');
                    $subject = $recipient['subject'] ?? $globalSubject;
                    $body    = $recipient['body']    ?? $globalBody;
                }

                if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    $failed[] = ['email' => $email ?: '(empty)', 'reason' => 'Invalid email address'];
                    continue;
                }

                if (empty($subject)) {
                    $failed[] = ['email' => $email, 'reason' => 'Subject is empty'];
                    continue;
                }

                try {
                    $smtpService->send(
                        $smtpCreds,
                        $account->email,
                        $account->display_name,
                        [$email => null],
                        [],
                        [],
                        $subject,
                        $body,
                        true,
                        $account->id,
                        $campaignSettings
                    );
                    $sent++;
                } catch (\Throwable $e) {
                    $failed[] = ['email' => $email, 'reason' => $e->getMessage()];
                }
            }
        } catch (\Throwable $e) {
            return response()->json([
                'error' => 'smtp_error',
                'message' => 'SMTP Error: ' . $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'sent'   => $sent,
            'failed' => $failed,
            'total'  => count($recipients),
        ]);
    }

    /**
     * Send bulk emails via Graph API or OAuth2 SMTP
     */
    private function sendViaGraph($account, $recipients, $globalSubject, $globalBody, $campaignSettings = []): JsonResponse
    {
        // Check setting: use_oauth2_smtp to decide which method to use
        $useOAuth2Smtp = \App\Models\Setting::get('use_oauth2_smtp', false);

        // Option 1: Send via Graph API (default)
        if (!$useOAuth2Smtp) {
            return $this->sendViaGraphAPI($account, $recipients, $globalSubject, $globalBody, $campaignSettings);
        }

        // Option 2: Send via OAuth2 SMTP (XOAUTH2)
        return $this->sendViaBulkOAuthSMTP($account, $recipients, $globalSubject, $globalBody, $campaignSettings);
    }

    /**
     * Send bulk emails via Graph API (default OAuth method)
     */
    private function sendViaGraphAPI($account, $recipients, $globalSubject, $globalBody, $campaignSettings = []): JsonResponse
    {
        try {
            $token  = $this->encryption->decrypt($account->access_token);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'token_decrypt_error',
                'message' => 'Failed to decrypt access token: ' . $e->getMessage(),
            ], 422);
        }

        // Validate token exists and is not obviously corrupted
        if (empty($token) || strlen($token) < 100) {
            return response()->json([
                'error' => 'invalid_token',
                'message' => 'Access token is malformed, empty, or truncated. The account credentials may need to be refreshed.',
            ], 422);
        }

        // Get signature to use (custom first, fallback to Outlook)
        $signatureId = $campaignSettings['signature_id'] ?? null;
        $includeSignature = $campaignSettings['include_signature'] ?? true;
        $customSignature = null;
        $outlookSignature = null;

        // 1. Check for custom signature (always preferred)
        if ($signatureId) {
            $customSignature = EmailSignature::find($signatureId);
        } else {
            // Get default signature for account
            $defaultSig = $account->signatures()->wherePivot('is_default', true)->first();
            if ($defaultSig) {
                $customSignature = $defaultSig;
            } else if ($account->signatures->count() > 0) {
                // Fallback to first available signature if no default
                $customSignature = $account->signatures->first();
            }
        }

        // 2. Fallback to Outlook signature if custom not set and enabled
        if (!$customSignature && !empty($includeSignature)) {
            $outlookSignature = $account->signature;
            if (!$outlookSignature) {
                $outlookSignature = SignatureService::getSignature($token);
                if ($outlookSignature) {
                    $account->update([
                        'signature' => $outlookSignature,
                        'signature_updated_at' => now(),
                    ]);
                }
            }
        }

        $sent   = 0;
        $failed = [];

        foreach ($recipients as $recipient) {
            // Normalise to array
            if (is_string($recipient)) {
                $email   = trim($recipient);
                $subject = $globalSubject;
                $body    = $globalBody;
            } else {
                $email   = trim($recipient['email'] ?? '');
                $subject = $recipient['subject'] ?? $globalSubject;
                $body    = $recipient['body']    ?? $globalBody;
            }

            if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $failed[] = ['email' => $email ?: '(empty)', 'reason' => 'Invalid email address'];
                continue;
            }

            if (empty($subject)) {
                $failed[] = ['email' => $email, 'reason' => 'Subject is empty'];
                continue;
            }

            try {
                // Build email body with signature
                $emailBody = $body;

                if ($customSignature) {
                    // Use custom signature (with variables resolved)
                    $variables = [
                        'accountEmail' => $account->email,
                        'accountName' => $account->display_name,
                        'accountPhone' => $account->phone ?? '',
                        'companyName' => config('app.name', 'Company'),
                        'currentDate' => now()->format('Y-m-d'),
                    ];
                    $signatureHtml = $customSignature->render($variables);
                    $emailBody = $emailBody . "\n\n" . $signatureHtml;
                } elseif ($outlookSignature && !empty($includeSignature)) {
                    // Fallback to Outlook signature
                    $emailBody = SignatureService::appendSignatureToBody($body, $outlookSignature);
                }

                $messagePayload = [
                    'message' => [
                        'subject' => $subject,
                        'body'    => ['contentType' => 'HTML', 'content' => $emailBody],
                        'toRecipients' => [['emailAddress' => ['address' => $email]]],
                    ],
                    'saveToSentItems' => true,
                ];

                // Add importance flag if enabled
                if (!empty($campaignSettings['markAsImportant'])) {
                    $messagePayload['message']['importance'] = 'high';
                }

                $this->graph->sendMail($token, $messagePayload);
                $sent++;
            } catch (\Throwable $e) {
                $failed[] = ['email' => $email, 'reason' => $e->getMessage()];
            }
        }

        return response()->json([
            'sent'   => $sent,
            'failed' => $failed,
            'total'  => count($recipients),
        ]);
    }

    /**
     * Send bulk emails via OAuth2 SMTP (alternative to Graph API)
     * For hybrid accounts (SMTP + OAuth), uses OAuth if available, falls back to SMTP
     */
    private function sendViaBulkOAuthSMTP($account, $recipients, $globalSubject, $globalBody, $campaignSettings = []): JsonResponse
    {
        $sent   = 0;
        $failed = [];

        try {
            // Get OAuth credentials from account
            $clientId = $account->oauth_client_id;
            $clientSecret = $account->oauth_client_secret ? $this->encryption->decrypt($account->oauth_client_secret) : null;
            $refreshToken = $account->refresh_token ? $this->encryption->decrypt($account->refresh_token) : null;

            // If this is a hybrid account (SMTP + OAuth) without OAuth credentials, fallback to SMTP
            if ($account->connection_type === 'smtp' && (!$clientId || !$clientSecret || !$refreshToken)) {
                return $this->sendViaSMTP($account, $recipients, $globalSubject, $globalBody);
            }

            if (!$clientId || !$clientSecret || !$refreshToken) {
                return response()->json([
                    'error' => 'oauth_error',
                    'message' => 'Missing OAuth credentials for SMTP authentication',
                ], 422);
            }

            $smtpService = new \App\Services\SmtpService();

            foreach ($recipients as $recipient) {
                // Normalise to array
                if (is_string($recipient)) {
                    $email   = trim($recipient);
                    $subject = $globalSubject;
                    $body    = $globalBody;
                } else {
                    $email   = trim($recipient['email'] ?? '');
                    $subject = $recipient['subject'] ?? $globalSubject;
                    $body    = $recipient['body']    ?? $globalBody;
                }

                if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    $failed[] = ['email' => $email ?: '(empty)', 'reason' => 'Invalid email address'];
                    continue;
                }

                if (empty($subject)) {
                    $failed[] = ['email' => $email, 'reason' => 'Subject is empty'];
                    continue;
                }

                try {
                    $smtpService->sendViaOAuth(
                        $account->email,
                        $account->display_name,
                        [$email => null],
                        [],
                        [],
                        $subject,
                        $body,
                        $clientId,
                        $clientSecret,
                        $refreshToken,
                        true,  // isHtml
                        $account->id,
                        $campaignSettings
                    );
                    $sent++;
                } catch (\Throwable $e) {
                    $failed[] = ['email' => $email, 'reason' => $e->getMessage()];
                }
            }

            return response()->json([
                'sent'   => $sent,
                'failed' => $failed,
                'total'  => count($recipients),
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => 'oauth_smtp_error',
                'message' => 'OAuth2 SMTP Error: ' . $e->getMessage(),
            ], 422);
        }
    }
}
