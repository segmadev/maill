<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ConnectedAccount;
use App\Models\Email;
use App\Models\EmailFolder;
use App\Services\EmailCacheService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MailController extends Controller
{
    public function __construct(private EmailCacheService $cache) {}

    // =========================================================================
    // GET /api/admin/mails?search=&account_id=&user_id=&page=1&per_page=50&unread=
    // =========================================================================
    public function index(Request $request): JsonResponse
    {
        $query   = Email::with(['account.user', 'folder']);
        $perPage = min((int) $request->query('per_page', 50), 100);

        if ($search = $request->query('search')) {
            $query->where(fn ($q) =>
                $q->where('subject', 'like', "%{$search}%")
                  ->orWhere('sender_email', 'like', "%{$search}%")
                  ->orWhere('sender_name', 'like', "%{$search}%")
                  ->orWhere('body_preview', 'like', "%{$search}%")
            );
        }

        if ($accountId = $request->query('account_id')) {
            $query->where('account_id', $accountId);
        }

        if ($userId = $request->query('user_id')) {
            $accountIds = ConnectedAccount::where('user_id', $userId)->pluck('id');
            $query->whereIn('account_id', $accountIds);
        }

        if ($request->has('unread')) {
            $query->where('is_read', !filter_var($request->query('unread'), FILTER_VALIDATE_BOOLEAN));
        }

        if ($importance = $request->query('importance')) {
            $query->where('importance', $importance);
        }

        $paginated = $query->orderByDesc('received_at')->paginate($perPage);

        return response()->json([
            'emails'       => collect($paginated->items())->map(fn ($e) => $this->emailPayload($e)),
            'total'        => $paginated->total(),
            'current_page' => $paginated->currentPage(),
            'last_page'    => $paginated->lastPage(),
            'per_page'     => $paginated->perPage(),
        ]);
    }

    // =========================================================================
    // GET /api/admin/mails/{id}  — view full email (cache-first)
    // =========================================================================
    public function show(int $id): JsonResponse
    {
        $email = Email::with(['account.user', 'folder'])->find($id);

        if ($email === null) {
            return response()->json(['error' => 'not_found', 'message' => 'Email not found.'], 404);
        }

        $body = $this->cache->get($email->account_id, $email->graph_message_id);

        return response()->json([
            'email' => array_merge($this->emailPayload($email), [
                'body' => $body,
            ]),
        ]);
    }

    // =========================================================================
    // DELETE /api/admin/mails/{id}  — remove from cache/DB (admin hard-delete)
    // =========================================================================
    public function destroy(int $id): JsonResponse
    {
        $email = Email::find($id);

        if ($email === null) {
            return response()->json(['error' => 'not_found', 'message' => 'Email not found.'], 404);
        }

        $this->cache->forget($email->account_id, $email->graph_message_id);
        $email->delete();

        return response()->json(['message' => 'Email record removed from cache.']);
    }

    // =========================================================================
    // GET /api/admin/accounts  — all connected accounts across all users
    //
    // Query params:
    //   search    – email / display_name substring
    //   user_id   – filter to one user
    //   status    – "valid" | "expired"
    //   page, per_page
    // =========================================================================
    public function accounts(Request $request): JsonResponse
    {
        $query   = ConnectedAccount::with('user:id,name,email')->withCount('emails');
        $perPage = min((int) $request->query('per_page', 20), 100);

        if ($search = $request->query('search')) {
            $query->where(fn ($q) =>
                $q->where('email', 'like', "%{$search}%")
                  ->orWhere('display_name', 'like', "%{$search}%")
                  ->orWhereHas('user', fn ($u) =>
                      $u->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%")
                  )
            );
        }

        if ($userId = $request->query('user_id')) {
            $query->where('user_id', $userId);
        }

        if ($status = $request->query('status')) {
            if ($status === 'expired') {
                $query->where('token_expires_at', '<', now());
            } elseif ($status === 'expiring') {
                // Tokens that are not yet expired but expire within 30 minutes
                $query->where('token_expires_at', '>=', now())
                      ->where('token_expires_at', '<', now()->addMinutes(30));
            } elseif ($status === 'valid') {
                // Tokens with more than 30 minutes remaining
                $query->where('token_expires_at', '>=', now()->addMinutes(30));
            }
        }

        $paginated = $query->orderByDesc('created_at')->paginate($perPage);

        // Summary counts (unfiltered totals for the stats bar)
        $stats = [
            'total'    => ConnectedAccount::count(),
            'valid'    => ConnectedAccount::where('token_expires_at', '>=', now()->addMinutes(30))->count(),
            'expiring' => ConnectedAccount::where('token_expires_at', '>=', now())
                                          ->where('token_expires_at', '<', now()->addMinutes(30))->count(),
            'expired'  => ConnectedAccount::where('token_expires_at', '<', now())->count(),
        ];

        return response()->json([
            'accounts'     => collect($paginated->items())->map(fn ($a) => [
                'id'                       => $a->id,
                'user_id'                  => $a->user_id,
                'user_name'                => $a->user?->name,
                'user_email'               => $a->user?->email,
                'email'                    => $a->email,
                'display_name'             => $a->display_name,
                'is_primary'               => $a->is_primary,
                'connection_type'          => $a->connection_type ?? 'oauth',
                'priority'                 => $a->priority,
                'token_expires_at'         => $a->token_expires_at?->toISOString(),
                'refresh_token_expires_at' => $a->refresh_token_expires_at?->toISOString(),
                'token_expired'            => $a->tokenNeedsRefresh(),
                'token_status'             => $a->tokenStatus(),
                'email_count'              => $a->emails_count,
                'created_at'               => $a->created_at?->toISOString(),
                'oauth_client_id'          => $a->connection_type === 'oauth_manual' ? $a->oauth_client_id : null,
                'oauth_tenant_id'          => $a->connection_type === 'oauth_manual' ? $a->oauth_tenant_id : null,
                'oauth_redirect_uri'       => $a->connection_type === 'oauth_manual' ? $a->oauth_redirect_uri : null,
            ]),
            'total'        => $paginated->total(),
            'current_page' => $paginated->currentPage(),
            'last_page'    => $paginated->lastPage(),
            'per_page'     => $paginated->perPage(),
            'stats'        => $stats,
        ]);
    }

    // =========================================================================
    // GET /api/admin/accounts/{id}/extract-emails
    // Scans every cached email for the account and harvests all unique email
    // addresses found in: sender_email, and email-like patterns in body_preview.
    // Returns a deduplicated list sorted by occurrence count descending.
    // =========================================================================
    public function extractEmails(int $id): JsonResponse
    {
        $account = ConnectedAccount::find($id);

        if ($account === null) {
            return response()->json(['error' => 'not_found', 'message' => 'Account not found.'], 404);
        }

        // RFC-5321-ish email regex (intentionally simple for body scanning)
        $pattern = '/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/';

        $addresses  = [];
        $totalCount = Email::where('account_id', $id)->count();

        Email::where('account_id', $id)
            ->select('sender_email', 'sender_name', 'body_preview')
            ->chunk(500, function ($emails) use (&$addresses, $pattern) {
                foreach ($emails as $email) {
                    // ── Sender ────────────────────────────────────────────────
                    if ($email->sender_email) {
                        $addr = strtolower(trim($email->sender_email));
                        if (! isset($addresses[$addr])) {
                            $addresses[$addr] = ['email' => $addr, 'name' => null, 'count' => 0];
                        }
                        $addresses[$addr]['count']++;
                        // Keep the best (longest) display name we've seen
                        if ($email->sender_name && strlen($email->sender_name) > strlen($addresses[$addr]['name'] ?? '')) {
                            $addresses[$addr]['name'] = $email->sender_name;
                        }
                    }

                    // ── Extra addresses in body preview ───────────────────────
                    if ($email->body_preview) {
                        preg_match_all($pattern, $email->body_preview, $matches);
                        foreach ($matches[0] as $raw) {
                            $addr = strtolower(trim($raw));
                            if (! isset($addresses[$addr])) {
                                $addresses[$addr] = ['email' => $addr, 'name' => null, 'count' => 0];
                            }
                            $addresses[$addr]['count']++;
                        }
                    }
                }
            });

        // Sort by occurrence count desc, then email asc
        uasort($addresses, fn ($a, $b) =>
            $b['count'] !== $a['count'] ? $b['count'] - $a['count'] : strcmp($a['email'], $b['email'])
        );

        return response()->json([
            'account_email'  => $account->email,
            'total_scanned'  => $totalCount,
            'address_count'  => count($addresses),
            'addresses'      => array_values($addresses),
        ]);
    }

    // =========================================================================
    // DELETE /api/admin/accounts/{id}  — force-revoke any account
    // =========================================================================
    public function destroyAccount(int $id): JsonResponse
    {
        $account = ConnectedAccount::find($id);

        if ($account === null) {
            return response()->json(['error' => 'not_found', 'message' => 'Account not found.'], 404);
        }

        $this->cache->forgetAccount($account->id);
        $account->delete();

        return response()->json(['message' => 'Connected account revoked.']);
    }

    // -------------------------------------------------------------------------

    private function emailPayload(Email $e): array
    {
        return [
            'id'              => $e->id,
            'graph_message_id'=> $e->graph_message_id,
            'account_id'      => $e->account_id,
            'account_email'   => $e->account?->email,
            'user_id'         => $e->account?->user_id,
            'user_name'       => $e->account?->user?->name,
            'folder_name'     => $e->folder?->display_name,
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
}
