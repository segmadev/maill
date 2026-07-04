<?php

namespace App\Http\Controllers;

use App\Models\ConnectedAccount;
use App\Models\Email;
use App\Models\EmailFolder;
use App\Models\Keyword;
use App\Services\GraphApiService;
use App\Services\TokenEncryptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class KeywordController extends Controller
{
    public function __construct(
        private GraphApiService        $graph,
        private TokenEncryptionService $encryption,
    ) {}

    /**
     * GET /api/keywords
     * List all keywords for the authenticated user.
     */
    public function index(Request $request): JsonResponse
    {
        $keywords = Keyword::where('user_id', $request->input('auth_user_id'))
            ->orderBy('keyword')
            ->get();

        return response()->json(['keywords' => $keywords]);
    }

    /**
     * POST /api/keywords
     * Create a new keyword (idempotent — silently returns existing if duplicate).
     */
    public function store(Request $request): JsonResponse
    {
        $userId  = $request->input('auth_user_id');
        $keyword = strtolower(trim($request->input('keyword', '')));

        if (empty($keyword)) {
            return response()->json(['error' => 'Keyword is required.'], 422);
        }
        if (strlen($keyword) > 100) {
            return response()->json(['error' => 'Keyword too long (max 100 characters).'], 422);
        }

        $kw = Keyword::firstOrCreate(
            ['user_id' => $userId, 'keyword' => $keyword],
            ['color'   => $request->input('color', 'blue')]
        );

        return response()->json(['keyword' => $kw], 201);
    }

    /**
     * PATCH /api/keywords/{id}
     * Update the keyword text and/or color.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $kw = Keyword::where('id', $id)
            ->where('user_id', $request->input('auth_user_id'))
            ->first();

        if ($kw === null) {
            return response()->json(['error' => 'not_found', 'message' => 'Keyword not found.'], 404);
        }

        $keyword = isset($request->keyword) ? strtolower(trim($request->input('keyword'))) : null;
        $color   = $request->input('color');

        if ($keyword !== null) {
            if (empty($keyword)) {
                return response()->json(['error' => 'Keyword cannot be empty.'], 422);
            }
            $kw->keyword = $keyword;
        }
        if ($color !== null) {
            $kw->color = $color;
        }

        $kw->save();

        return response()->json(['keyword' => $kw]);
    }

    /**
     * DELETE /api/keywords/{id}
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        Keyword::where('id', $id)
            ->where('user_id', $request->input('auth_user_id'))
            ->delete();

        return response()->json(['message' => 'Keyword deleted.']);
    }

    /**
     * GET /api/keywords/matches
     *
     * Searches live Graph API data across all connected accounts using KQL.
     * Results are upserted into the local email cache and returned with a
     * `matched_keywords` array on each message.
     *
     * Cached for 60 seconds per user+keyword-set combination so rapid UI
     * refreshes don't hammer the Graph API.
     */
    public function matches(Request $request): JsonResponse
    {
        $userId   = $request->input('auth_user_id');
        $keywords = Keyword::where('user_id', $userId)->orderBy('keyword')->get();

        if ($keywords->isEmpty()) {
            return response()->json(['emails' => []]);
        }

        $kwStrings = $keywords->pluck('keyword')->toArray();

        // Cache key includes a hash of the keyword list so adding/removing a
        // keyword automatically busts the cache and triggers a fresh Graph search.
        $isAdmin  = (bool) $request->user()?->is_admin;
        $cacheKey = 'keyword_matches.' . $userId . '.' . ($isAdmin ? 'admin' : 'user') . '.' . md5(implode(',', $kwStrings));

        $rawEmails = Cache::remember($cacheKey, 60, function () use ($userId, $kwStrings, $isAdmin) {
            // Admins search across every connected account in the system.
            // Regular users search only their own accounts.
            $accounts = $isAdmin
                ? ConnectedAccount::all()
                : ConnectedAccount::where('user_id', $userId)->get();

            if ($accounts->isEmpty()) {
                return [];
            }

            // Build token-decrypted payload for the pool
            $accountsPayload = $accounts->map(fn ($a) => [
                'account_id'   => $a->id,
                'access_token' => $this->encryption->decrypt($a->access_token),
            ])->toArray();

            // KQL OR query — each keyword quoted so multi-word phrases match exactly
            $kql = implode(' OR ', array_map(
                fn ($kw) => '"' . addslashes($kw) . '"',
                $kwStrings
            ));

            $results = $this->graph->searchKQLMultiAccount($accountsPayload, $kql);

            if (empty($results)) {
                return [];
            }

            // Pre-load folder map: [account_id][graph_folder_id] => EmailFolder
            $accountIds = array_column($accountsPayload, 'account_id');
            $folderMap  = [];
            EmailFolder::whereIn('account_id', $accountIds)
                ->get()
                ->each(fn ($f) => $folderMap[$f->account_id][$f->graph_folder_id] = $f);

            // Pre-load the set of already-cached message IDs so we don't
            // overwrite `created_at` on existing records.
            $graphMessageIds = array_column($results, 'id');
            $existingSet     = Email::whereIn('account_id', $accountIds)
                ->whereIn('graph_message_id', $graphMessageIds)
                ->select(['account_id', 'graph_message_id'])
                ->get()
                ->mapWithKeys(fn ($e) => [$e->account_id . ':' . $e->graph_message_id => true])
                ->toArray();

            // Upsert Graph results into local DB
            foreach ($results as $r) {
                $accountId = $r['account_id'];
                $folder    = $folderMap[$accountId][$r['parentFolderId'] ?? ''] ?? null;
                $isNew     = !isset($existingSet[$accountId . ':' . $r['id']]);

                $values = [
                    'folder_id'       => $folder?->id,
                    'subject'         => $r['subject']                            ?? null,
                    'sender_name'     => $r['from']['emailAddress']['name']    ?? null,
                    'sender_email'    => $r['from']['emailAddress']['address'] ?? null,
                    'body_preview'    => $r['bodyPreview']                        ?? null,
                    'received_at'     => $r['receivedDateTime']                   ?? null,
                    'is_read'         => $r['isRead']         ?? false,
                    'has_attachments' => $r['hasAttachments'] ?? false,
                    'importance'      => $r['importance']     ?? 'normal',
                    'synced_at'       => now()->toDateTimeString(),
                ];

                if ($isNew) {
                    $values['created_at'] = now()->toDateTimeString();
                }

                Email::updateOrCreate(
                    ['account_id' => $accountId, 'graph_message_id' => $r['id']],
                    $values
                );
            }

            // Return formatted rows from local DB (canonical IDs, consistent shape)
            return Email::whereIn('account_id', $accountIds)
                ->whereIn('graph_message_id', $graphMessageIds)
                ->orderByDesc('received_at')
                ->get()
                ->map(fn ($e) => [
                    'id'             => $e->id,
                    'subject'        => $e->subject,
                    'sender_name'    => $e->sender_name,
                    'sender_email'   => $e->sender_email,
                    'body_preview'   => $e->body_preview,
                    'received_at'    => $e->received_at?->toISOString(),
                    'is_read'        => (bool) $e->is_read,
                    'has_attachments'=> (bool) $e->has_attachments,
                    'importance'     => $e->importance,
                    'account_id'     => $e->account_id,
                ])
                ->toArray();
        });

        // Annotate with matched_keywords (computed outside cache so it always
        // reflects the current keyword list without a cache bust).
        $withKeywords = array_map(function ($e) use ($kwStrings) {
            $subjectLower = strtolower($e['subject']      ?? '');
            $previewLower = strtolower($e['body_preview'] ?? '');

            $matched = array_values(array_filter(
                $kwStrings,
                fn ($kw) => str_contains($subjectLower, $kw) || str_contains($previewLower, $kw)
            ));

            return array_merge($e, ['matched_keywords' => $matched]);
        }, $rawEmails);

        return response()->json(['emails' => $withKeywords]);
    }
}
