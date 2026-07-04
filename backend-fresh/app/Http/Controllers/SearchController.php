<?php

namespace App\Http\Controllers;

use App\Models\ConnectedAccount;
use App\Services\GraphApiService;
use App\Services\TokenEncryptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SearchController extends Controller
{
    public function __construct(
        private GraphApiService        $graph,
        private TokenEncryptionService $encryption,
    ) {}

    /**
     * GET /api/search?q=invoice&accounts[]=1&accounts[]=2
     *
     * Fires parallel Graph searches across requested (or all) connected accounts.
     * Results are merged and sorted by receivedDateTime descending.
     */
    public function search(Request $request): JsonResponse
    {
        try {
            $data = $request->validate([
                'q'           => 'required|string|min:2|max:255',
                'accounts'    => 'nullable|array',
                'accounts.*'  => 'integer',
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'error'   => 'validation_failed',
                'message' => 'The given data was invalid.',
                'errors'  => $e->errors(),
            ], 422);
        }

        $userId = $request->input('auth_user_id');

        // Resolve which accounts to search
        $query = ConnectedAccount::where('user_id', $userId);
        if (!empty($data['accounts'])) {
            $query->whereIn('id', $data['accounts']);
        }
        $accounts = $query->get();

        if ($accounts->isEmpty()) {
            return response()->json(['results' => [], 'query' => $data['q']]);
        }

        // Build the array expected by searchMessagesMultiAccount
        $accountTokens = $accounts->map(fn ($a) => [
            'account_id'   => $a->id,
            'access_token' => $this->encryption->decrypt($a->access_token),
        ])->values()->all();

        try {
            $messages = $this->graph->searchMessagesMultiAccount($accountTokens, $data['q']);
        } catch (\RuntimeException $e) {
            return response()->json([
                'error'   => 'graph_error',
                'message' => $e->getMessage(),
            ], 502);
        }

        $results = array_map(fn ($msg) => [
            'graph_message_id' => $msg['id']                                         ?? null,
            'account_id'       => $msg['account_id']                                 ?? null,
            'subject'          => $msg['subject']                                    ?? null,
            'body_preview'     => $msg['bodyPreview']                                ?? null,
            'sender_name'      => $msg['from']['emailAddress']['name']               ?? null,
            'sender_email'     => $msg['from']['emailAddress']['address']            ?? null,
            'received_at'      => $msg['receivedDateTime']                           ?? null,
            'is_read'          => $msg['isRead']                                     ?? false,
            'has_attachments'  => $msg['hasAttachments']                             ?? false,
        ], $messages);

        return response()->json([
            'results' => $results,
            'query'   => $data['q'],
            'count'   => count($results),
        ]);
    }
}
