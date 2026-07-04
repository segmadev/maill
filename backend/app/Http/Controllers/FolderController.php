<?php

namespace App\Http\Controllers;

use App\Models\ConnectedAccount;
use App\Models\EmailFolder;
use App\Services\GraphApiService;
use App\Services\TokenEncryptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class FolderController extends Controller
{
    public function __construct(
        private GraphApiService        $graph,
        private TokenEncryptionService $encryption,
    ) {}

    /**
     * GET /api/accounts/{id}/folders
     *
     * Returns cached folders from DB. If the account has never been synced
     * (or if ?refresh=1 is passed), fetches live from Graph and updates cache.
     */
    public function index(Request $request, int $accountId): JsonResponse
    {
        $account = $this->resolveAccount($request, $accountId);
        if ($account instanceof JsonResponse) return $account;

        $forceRefresh = $request->boolean('refresh', false);
        $cacheKey     = "folders.{$accountId}";

        // Sync from Graph when forced or when no DB records exist yet.
        if ($forceRefresh || !EmailFolder::where('account_id', $accountId)->exists()) {
            try {
                $this->syncFolders($account);
            } catch (\RuntimeException $e) {
                return $this->graphError($e);
            }
            // Bust the 5-minute cache so the fresh data is returned immediately.
            Cache::forget($cacheKey);
        }

        // Cache the serialised folder list for 5 minutes to avoid redundant DB
        // reads on every sidebar mount / account expand.
        $folders = Cache::remember($cacheKey, 300, function () use ($accountId) {
            return EmailFolder::where('account_id', $accountId)
                ->orderBy('display_name')
                ->get()
                ->map(fn ($f) => $this->folderPayload($f))
                ->toArray();
        });

        return response()->json(['folders' => $folders]);
    }

    // -------------------------------------------------------------------------

    private function syncFolders(ConnectedAccount $account): void
    {
        $token   = $this->encryption->decrypt($account->access_token);
        $folders = $this->graph->getFolders($token);

        foreach ($folders as $f) {
            EmailFolder::updateOrCreate(
                ['account_id' => $account->id, 'graph_folder_id' => $f['id']],
                [
                    'display_name'     => $f['displayName'],
                    'parent_folder_id' => $f['parentFolderId'] ?? null,
                    'total_items'      => $f['totalItemCount']  ?? 0,
                    'unread_items'     => $f['unreadItemCount'] ?? 0,
                    'synced_at'        => now(),
                ]
            );
        }
    }

    private function resolveAccount(Request $request, int $accountId): ConnectedAccount|JsonResponse
    {
        $query = ConnectedAccount::where('id', $accountId);

        // Admins can access any account; regular users only their own.
        if (! $request->user()?->is_admin) {
            $query->where('user_id', $request->input('auth_user_id'));
        }

        $account = $query->first();

        if ($account === null) {
            return response()->json([
                'error'   => 'not_found',
                'message' => 'Account not found or does not belong to you.',
            ], 404);
        }

        return $account;
    }

    private function folderPayload(EmailFolder $f): array
    {
        return [
            'id'               => $f->id,
            'graph_folder_id'  => $f->graph_folder_id,
            'display_name'     => $f->display_name,
            'parent_folder_id' => $f->parent_folder_id,
            'total_items'      => $f->total_items,
            'unread_items'     => $f->unread_items,
            'synced_at'        => $f->synced_at?->toISOString(),
        ];
    }

    private function graphError(\RuntimeException $e): JsonResponse
    {
        $msg    = $e->getMessage();
        // NOTE: graph_unauthorized MUST NOT return HTTP 401 — the frontend Axios
        // interceptor treats any 401 as a session expiry and redirects to login.
        // A Graph auth failure is a problem with the connected account's token,
        // not with the admin's JWT session. Use 503 so it surfaces as a toast.
        $status = str_contains($msg, 'graph_not_found')    ? 404
                : (str_contains($msg, 'graph_unauthorized') ? 503
                : (str_contains($msg, 'graph_rate_limited') ? 429 : 502));

        return response()->json([
            'error'   => 'graph_error',
            'message' => $msg,
        ], $status);
    }
}
