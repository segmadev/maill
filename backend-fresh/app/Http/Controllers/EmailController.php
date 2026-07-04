<?php

namespace App\Http\Controllers;

use App\Models\ConnectedAccount;
use App\Models\Email;
use App\Models\EmailFolder;
use App\Services\EmailCacheService;
use App\Services\GraphApiService;
use App\Services\TokenEncryptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class EmailController extends Controller
{
    public function __construct(
        private GraphApiService        $graph,
        private TokenEncryptionService $encryption,
        private EmailCacheService      $cache,
    ) {}

    // =========================================================================
    // GET /api/accounts/{id}/emails?folder_id=xxx&page=1&per_page=50
    // =========================================================================
    public function index(Request $request, int $accountId): JsonResponse
    {
        $account = $this->resolveAccount($request, $accountId);
        if ($account instanceof JsonResponse) return $account;

        try {
            $data = $request->validate([
                'folder_id' => 'required|string',
                'page'      => 'integer|min:1',
                'per_page'  => 'integer|min:1|max:100',
            ]);
        } catch (ValidationException $e) {
            return $this->validationError($e);
        }

        $page    = (int) ($data['page']     ?? 1);
        $perPage = (int) ($data['per_page'] ?? 50);
        $skip    = ($page - 1) * $perPage;

        // Find or create folder row
        $folder = EmailFolder::where('account_id', $accountId)
            ->where('graph_folder_id', $data['folder_id'])
            ->first();

        // Sync from Graph: fetch first page, diff against cache
        try {
            $token    = $this->encryption->decrypt($account->access_token);
            $response = $this->graph->getMessages($token, $data['folder_id'], $perPage, $skip);
            $messages = $response['value'] ?? [];

            if ($folder === null) {
                $folder = EmailFolder::updateOrCreate(
                    ['account_id' => $accountId, 'graph_folder_id' => $data['folder_id']],
                    ['display_name' => 'Unknown', 'synced_at' => now()]
                );
            }

            foreach ($messages as $msg) {
                Email::updateOrCreate(
                    ['graph_message_id' => $msg['id']],
                    [
                        'account_id'      => $accountId,
                        'folder_id'       => $folder->id,
                        'subject'         => $msg['subject']       ?? null,
                        'sender_name'     => $msg['from']['emailAddress']['name']    ?? null,
                        'sender_email'    => $msg['from']['emailAddress']['address'] ?? null,
                        'received_at'     => isset($msg['receivedDateTime'])
                            ? \Carbon\Carbon::parse($msg['receivedDateTime'])
                            : null,
                        'is_read'         => $msg['isRead']         ?? false,
                        'has_attachments' => $msg['hasAttachments'] ?? false,
                        'importance'      => strtolower($msg['importance'] ?? 'normal'),
                        'body_preview'    => substr($msg['bodyPreview'] ?? '', 0, 500),
                        'synced_at'       => now(),
                    ]
                );
            }
        } catch (\RuntimeException $e) {
            // Fall back to cached data if Graph is unavailable
            return $this->serveCachedEmails($folder, $page, $perPage);
        }

        return $this->serveCachedEmails($folder, $page, $perPage);
    }

    // =========================================================================
    // GET /api/emails/{id}
    // =========================================================================
    public function show(Request $request, int $emailId): JsonResponse
    {
        $email = Email::find($emailId);

        if ($email === null) {
            return $this->notFound('Email not found.');
        }

        // Verify ownership — admins may access any account's emails.
        $accountQuery = ConnectedAccount::where('id', $email->account_id);
        if (! $request->user()?->is_admin) {
            $accountQuery->where('user_id', $request->input('auth_user_id'));
        }
        $account = $accountQuery->first();

        if ($account === null) {
            return $this->notFound('Email not found.');
        }

        // Cache-first: return body from JSON file if available
        $cached = $this->cache->get($account->id, $email->graph_message_id);
        if ($cached !== null) {
            return response()->json(['email' => array_merge($this->emailPayload($email), ['body' => $cached])]);
        }

        // Fetch full message from Graph
        try {
            $token   = $this->encryption->decrypt($account->access_token);
            $message = $this->graph->getMessage($token, $email->graph_message_id);

            // Persist to cache
            $this->cache->put($account->id, $message);

            $bodyPayload = [
                'subject'     => $message['subject']  ?? '',
                'body_html'   => strtolower($message['body']['contentType'] ?? '') === 'html'
                    ? ($message['body']['content'] ?? '')
                    : '',
                'body_text'   => strtolower($message['body']['contentType'] ?? '') === 'text'
                    ? ($message['body']['content'] ?? '')
                    : '',
                'attachments' => [],
                'headers'     => $message['internetMessageHeaders'] ?? [],
                'cached_at'   => now()->toISOString(),
            ];

            return response()->json([
                'email' => array_merge($this->emailPayload($email), ['body' => $bodyPayload])
            ]);
        } catch (\RuntimeException $e) {
            return $this->graphError($e);
        }
    }

    // =========================================================================
    // POST /api/emails/send
    // =========================================================================
    public function send(Request $request): JsonResponse
    {
        try {
            $data = $request->validate([
                'account_id'           => 'required|integer',
                'subject'              => 'required|string|max:998',
                'body'                 => 'required|string',
                'body_type'            => 'in:html,text',
                'to'                   => 'required|array|min:1',
                'to.*.email'           => 'required|email',
                'to.*.name'            => 'nullable|string',
                'cc'                   => 'nullable|array',
                'cc.*.email'           => 'required_with:cc|email',
                'cc.*.name'            => 'nullable|string',
                'bcc'                  => 'nullable|array',
                'bcc.*.email'          => 'required_with:bcc|email',
            ]);
        } catch (ValidationException $e) {
            return $this->validationError($e);
        }

        $account = $this->resolveAccount($request, (int) $data['account_id']);
        if ($account instanceof JsonResponse) return $account;

        // Handle SMTP vs OAuth accounts differently
        if ($account->connection_type === 'smtp') {
            return $this->sendViaSMTP($account, $data);
        } else {
            return $this->sendViaGraph($account, $data);
        }
    }

    /**
     * Send email via SMTP
     */
    private function sendViaSMTP($account, $data): JsonResponse
    {
        try {
            $smtpCreds = json_decode($this->encryption->decrypt($account->smtp_credentials), true);

            if (!$smtpCreds) {
                return response()->json([
                    'error' => 'smtp_error',
                    'message' => 'Invalid SMTP credentials',
                ], 422);
            }

            // Build recipient arrays
            $to = [];
            foreach ($data['to'] as $recipient) {
                $to[$recipient['email']] = $recipient['name'] ?? '';
            }

            $cc = [];
            foreach ($data['cc'] ?? [] as $recipient) {
                $cc[$recipient['email']] = $recipient['name'] ?? '';
            }

            $bcc = [];
            foreach ($data['bcc'] ?? [] as $recipient) {
                $bcc[$recipient['email']] = '';
            }

            // Use SmtpService to send
            $smtpService = new \App\Services\SmtpService();
            $smtpService->send(
                $smtpCreds,
                $account->email,
                $account->display_name,
                $to,
                $cc,
                $bcc,
                $data['subject'],
                $data['body'],
                $data['body_type'] === 'html',
                $account->id
            );

            return response()->json(['message' => 'Email sent successfully via SMTP.']);
        } catch (\Exception $e) {
            \Log::error('SMTP Send Error', [
                'account_id' => $account->id,
                'error' => $e->getMessage(),
                'exception' => get_class($e),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);
            return response()->json([
                'error' => 'smtp_error',
                'message' => 'SMTP Error: ' . $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Send email via Microsoft Graph API
     */
    private function sendViaGraph($account, $data): JsonResponse
    {
        // Check setting: use_oauth2_smtp to decide which method to use
        $useOAuth2Smtp = \App\Models\Setting::get('use_oauth2_smtp', false);

        // Option 1: Send via Graph API (default)
        if (!$useOAuth2Smtp) {
            return $this->sendViaGraphAPI($account, $data);
        }

        // Option 2: Send via OAuth2 SMTP (XOAUTH2)
        return $this->sendViaOAuthSMTP($account, $data);
    }

    /**
     * Send via Microsoft Graph API (default OAuth method)
     */
    private function sendViaGraphAPI($account, $data): JsonResponse
    {
        $payload = [
            'message' => [
                'subject' => $data['subject'],
                'body'    => [
                    'contentType' => $data['body_type'] ?? 'html',
                    'content'     => $data['body'],
                ],
                'toRecipients'  => $this->buildRecipients($data['to']),
                'ccRecipients'  => $this->buildRecipients($data['cc']  ?? []),
                'bccRecipients' => $this->buildRecipients($data['bcc'] ?? []),
            ],
            'saveToSentItems' => true,
        ];

        try {
            $token = $this->encryption->decrypt($account->access_token);

            // Validate token exists and is not obviously corrupted
            if (empty($token) || strlen($token) < 100) {
                return response()->json([
                    'error' => 'invalid_token',
                    'message' => 'Access token is malformed, empty, or truncated. The account credentials may need to be refreshed.',
                ], 422);
            }

            $this->graph->sendMail($token, $payload);
            return response()->json(['message' => 'Email sent successfully.']);
        } catch (\RuntimeException $e) {
            return $this->graphError($e);
        }
    }

    /**
     * Send via OAuth2 SMTP (alternative to Graph API)
     * Uses proper XOAUTH2 authentication with automatic token refresh
     * For hybrid accounts (SMTP + OAuth), uses OAuth if available, falls back to SMTP
     */
    private function sendViaOAuthSMTP($account, $data): JsonResponse
    {
        try {
            // Build recipient arrays
            $to = [];
            foreach ($data['to'] as $recipient) {
                $to[$recipient['email']] = $recipient['name'] ?? '';
            }

            $cc = [];
            foreach ($data['cc'] ?? [] as $recipient) {
                $cc[$recipient['email']] = $recipient['name'] ?? '';
            }

            $bcc = [];
            foreach ($data['bcc'] ?? [] as $recipient) {
                $bcc[$recipient['email']] = '';
            }

            // Get OAuth credentials from account
            $clientId = $account->oauth_client_id;
            $clientSecret = $account->oauth_client_secret ? $this->encryption->decrypt($account->oauth_client_secret) : null;
            $refreshToken = $account->refresh_token ? $this->encryption->decrypt($account->refresh_token) : null;

            // If this is a hybrid account (SMTP + OAuth) without OAuth credentials, fallback to SMTP
            if ($account->connection_type === 'smtp' && (!$clientId || !$clientSecret || !$refreshToken)) {
                return $this->sendViaSMTP($account, $data);
            }

            if (!$clientId || !$clientSecret || !$refreshToken) {
                return response()->json([
                    'error' => 'oauth_error',
                    'message' => 'Missing OAuth credentials for SMTP authentication',
                ], 422);
            }

            // Use SmtpService to send via OAuth2
            $smtpService = new \App\Services\SmtpService();
            $smtpService->sendViaOAuth(
                $account->email,
                $account->display_name,
                $to,
                $cc,
                $bcc,
                $data['subject'],
                $data['body'],
                $clientId,
                $clientSecret,
                $refreshToken,
                $data['body_type'] === 'html',
                $account->id
            );

            return response()->json(['message' => 'Email sent successfully via OAuth2 SMTP.']);
        } catch (\Exception $e) {
            \Log::error('OAuth2 SMTP Send Error', [
                'account_id' => $account->id,
                'error' => $e->getMessage(),
            ]);
            return response()->json([
                'error' => 'oauth_smtp_error',
                'message' => 'OAuth2 SMTP Error: ' . $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Check if account type supports receive/manage operations
     */
    private function checkAccountSupportsReceive($account): ?JsonResponse
    {
        if ($account->connection_type === 'smtp') {
            return response()->json([
                'error' => 'unsupported_operation',
                'message' => 'SMTP accounts are send-only and do not support receiving or managing emails.',
            ], 422);
        }
        return null;
    }

    // =========================================================================
    // PATCH /api/emails/{id}/read
    // =========================================================================
    public function markRead(Request $request, int $emailId): JsonResponse
    {
        [$email, $account, $err] = $this->resolveEmailAndAccount($request, $emailId);
        if ($err) return $err;

        // SMTP accounts don't support receiving emails
        if ($checkErr = $this->checkAccountSupportsReceive($account)) return $checkErr;

        $isRead = $request->boolean('is_read', true);

        try {
            $token = $this->encryption->decrypt($account->access_token);
            $this->graph->markRead($token, $email->graph_message_id, $isRead);
            $email->update(['is_read' => $isRead]);
            return response()->json(['message' => 'Updated.', 'is_read' => $isRead]);
        } catch (\RuntimeException $e) {
            return $this->graphError($e);
        }
    }

    // =========================================================================
    // DELETE /api/emails/{id}  — moves to Deleted Items (soft delete)
    // =========================================================================
    public function destroy(Request $request, int $emailId): JsonResponse
    {
        [$email, $account, $err] = $this->resolveEmailAndAccount($request, $emailId);
        if ($err) return $err;

        // SMTP accounts don't support receiving emails
        if ($checkErr = $this->checkAccountSupportsReceive($account)) return $checkErr;

        try {
            $token = $this->encryption->decrypt($account->access_token);
            $this->graph->moveMessage($token, $email->graph_message_id, 'deleteditems');
            $this->cache->forget($account->id, $email->graph_message_id);
            $email->delete();
            return response()->json(['message' => 'Email moved to Deleted Items.']);
        } catch (\RuntimeException $e) {
            return $this->graphError($e);
        }
    }

    // =========================================================================
    // POST /api/emails/{id}/reply
    // =========================================================================
    public function reply(Request $request, int $emailId): JsonResponse
    {
        [$email, $account, $err] = $this->resolveEmailAndAccount($request, $emailId);
        if ($err) return $err;

        // SMTP accounts don't support receiving emails
        if ($checkErr = $this->checkAccountSupportsReceive($account)) return $checkErr;

        try {
            $data = $request->validate([
                'comment'  => 'required|string',
                'reply_all'=> 'boolean',
            ]);
        } catch (ValidationException $e) {
            return $this->validationError($e);
        }

        try {
            $token = $this->encryption->decrypt($account->access_token);
            if ($request->boolean('reply_all')) {
                $this->graph->replyAllToMessage($token, $email->graph_message_id, $data['comment']);
            } else {
                $this->graph->replyToMessage($token, $email->graph_message_id, $data['comment']);
            }
            return response()->json(['message' => 'Reply sent.']);
        } catch (\RuntimeException $e) {
            return $this->graphError($e);
        }
    }

    // =========================================================================
    // PATCH /api/emails/{id}/flag
    // =========================================================================
    public function flag(Request $request, int $emailId): JsonResponse
    {
        [$email, $account, $err] = $this->resolveEmailAndAccount($request, $emailId);
        if ($err) return $err;

        // SMTP accounts don't support receiving emails
        if ($checkErr = $this->checkAccountSupportsReceive($account)) return $checkErr;

        $flagged = $request->boolean('flagged', true);

        try {
            $token = $this->encryption->decrypt($account->access_token);
            $this->graph->patchMessage($token, $email->graph_message_id, [
                'flag' => ['flagStatus' => $flagged ? 'flagged' : 'notFlagged'],
            ]);
            return response()->json(['message' => 'Updated.', 'flagged' => $flagged]);
        } catch (\RuntimeException $e) {
            return $this->graphError($e);
        }
    }

    // =========================================================================
    // POST /api/emails/{id}/move
    // =========================================================================
    public function move(Request $request, int $emailId): JsonResponse
    {
        [$email, $account, $err] = $this->resolveEmailAndAccount($request, $emailId);
        if ($err) return $err;

        // SMTP accounts don't support receiving emails
        if ($checkErr = $this->checkAccountSupportsReceive($account)) return $checkErr;

        try {
            $data = $request->validate([
                'destination_id' => 'required|string',
            ]);
        } catch (ValidationException $e) {
            return $this->validationError($e);
        }

        try {
            $token = $this->encryption->decrypt($account->access_token);
            $this->graph->moveMessage($token, $email->graph_message_id, $data['destination_id']);
            $this->cache->forget($account->id, $email->graph_message_id);
            $email->delete();
            return response()->json(['message' => 'Email moved.']);
        } catch (\RuntimeException $e) {
            return $this->graphError($e);
        }
    }

    // =========================================================================
    // GET /api/emails/{id}/attachments
    // =========================================================================
    public function attachments(Request $request, int $emailId): JsonResponse
    {
        [$email, $account, $err] = $this->resolveEmailAndAccount($request, $emailId);
        if ($err) return $err;

        try {
            $token       = $this->encryption->decrypt($account->access_token);
            $attachments = $this->graph->getAttachments($token, $email->graph_message_id);
            return response()->json(['attachments' => $attachments]);
        } catch (\RuntimeException $e) {
            return $this->graphError($e);
        }
    }

    // =========================================================================
    // POST /api/emails/{id}/forward
    // =========================================================================
    public function forward(Request $request, int $emailId): JsonResponse
    {
        [$email, $account, $err] = $this->resolveEmailAndAccount($request, $emailId);
        if ($err) return $err;

        // SMTP accounts don't support receiving emails
        if ($checkErr = $this->checkAccountSupportsReceive($account)) return $checkErr;

        try {
            $data = $request->validate([
                'comment'      => 'nullable|string',
                'to'           => 'required|array|min:1',
                'to.*.email'   => 'required|email',
                'to.*.name'    => 'nullable|string',
            ]);
        } catch (ValidationException $e) {
            return $this->validationError($e);
        }

        try {
            $token = $this->encryption->decrypt($account->access_token);
            $this->graph->forwardMessage(
                $token,
                $email->graph_message_id,
                $data['comment'] ?? '',
                $this->buildRecipients($data['to'])
            );
            return response()->json(['message' => 'Email forwarded.']);
        } catch (\RuntimeException $e) {
            return $this->graphError($e);
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private function serveCachedEmails(?EmailFolder $folder, int $page, int $perPage): JsonResponse
    {
        if ($folder === null) {
            return response()->json(['emails' => [], 'total' => 0, 'page' => $page, 'per_page' => $perPage]);
        }

        $emails = Email::where('folder_id', $folder->id)
            ->orderByDesc('received_at')
            ->forPage($page, $perPage)
            ->get()
            ->map(fn ($e) => $this->emailPayload($e));

        $total = Email::where('folder_id', $folder->id)->count();

        return response()->json([
            'emails'   => $emails,
            'total'    => $total,
            'page'     => $page,
            'per_page' => $perPage,
        ]);
    }

    private function resolveAccount(Request $request, int $accountId): ConnectedAccount|JsonResponse
    {
        $query = ConnectedAccount::where('id', $accountId);

        // Admins can access any account; regular users only their own.
        if (! $request->user()?->is_admin) {
            $query->where('user_id', $request->input('auth_user_id'));
        }

        $account = $query->first();

        return $account ?? response()->json([
            'error'   => 'not_found',
            'message' => 'Account not found or does not belong to you.',
        ], 404);
    }

    /** @return array{Email|null, ConnectedAccount|null, JsonResponse|null} */
    private function resolveEmailAndAccount(Request $request, int $emailId): array
    {
        $email = Email::find($emailId);

        if ($email === null) {
            return [null, null, $this->notFound('Email not found.')];
        }

        $query = ConnectedAccount::where('id', $email->account_id);

        // Admins can access emails from any account.
        if (! $request->user()?->is_admin) {
            $query->where('user_id', $request->input('auth_user_id'));
        }

        $account = $query->first();

        if ($account === null) {
            return [null, null, $this->notFound('Email not found.')];
        }

        return [$email, $account, null];
    }

    private function emailPayload(Email $e): array
    {
        return [
            'id'              => $e->id,
            'graph_message_id'=> $e->graph_message_id,
            'account_id'      => $e->account_id,
            'folder_id'       => $e->folder_id,
            'subject'         => $e->subject,
            'sender_name'     => $e->sender_name,
            'sender_email'    => $e->sender_email,
            'received_at'     => $e->received_at?->toISOString(),
            'is_read'         => $e->is_read,
            'has_attachments' => $e->has_attachments,
            'importance'      => $e->importance,
            'body_preview'    => $e->body_preview,
        ];
    }

    private function buildRecipients(array $list): array
    {
        return array_map(fn ($r) => [
            'emailAddress' => [
                'address' => $r['email'],
                'name'    => $r['name'] ?? '',
            ],
        ], $list);
    }

    private function validationError(ValidationException $e): JsonResponse
    {
        return response()->json([
            'error'   => 'validation_failed',
            'message' => 'The given data was invalid.',
            'errors'  => $e->errors(),
        ], 422);
    }

    private function notFound(string $message): JsonResponse
    {
        return response()->json(['error' => 'not_found', 'message' => $message], 404);
    }

    private function graphError(\RuntimeException $e): JsonResponse
    {
        $msg    = $e->getMessage();
        // NOTE: graph_unauthorized MUST NOT return HTTP 401 — the frontend Axios
        // interceptor treats any 401 as a session expiry and redirects to login.
        // Use 503 so Graph auth failures surface as a toast, not a logout.
        $status = str_contains($msg, 'graph_not_found')    ? 404
                : (str_contains($msg, 'graph_unauthorized') ? 503
                : (str_contains($msg, 'graph_rate_limited') ? 429 : 502));

        return response()->json(['error' => 'graph_error', 'message' => $msg], $status);
    }
}
