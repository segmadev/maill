<?php

namespace App\Http\Controllers;

use App\Models\Draft;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DraftController extends Controller
{
    /**
     * GET /api/drafts
     * List all drafts for the authenticated user, newest first.
     */
    public function index(Request $request): JsonResponse
    {
        $drafts = Draft::where('user_id', $request->input('auth_user_id'))
            ->orderByDesc('updated_at')
            ->get();

        return response()->json(['drafts' => $drafts]);
    }

    /**
     * POST /api/drafts
     * Create a new draft.
     */
    public function store(Request $request): JsonResponse
    {
        $draft = Draft::create([
            'user_id'    => $request->input('auth_user_id'),
            'account_id' => $request->input('account_id'),
            'to'         => $request->input('to',  []),
            'cc'         => $request->input('cc',  []),
            'bcc'        => $request->input('bcc', []),
            'subject'    => $request->input('subject', ''),
            'body'       => $request->input('body',    ''),
        ]);

        return response()->json(['draft' => $draft], 201);
    }

    /**
     * PATCH /api/drafts/{id}
     * Partially update an existing draft (only provided fields are changed).
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $draft = Draft::where('id', $id)
            ->where('user_id', $request->input('auth_user_id'))
            ->first();

        if (!$draft) {
            return response()->json(['error' => 'not_found', 'message' => 'Draft not found.'], 404);
        }

        $data = [];
        foreach (['account_id', 'to', 'cc', 'bcc', 'subject', 'body'] as $field) {
            if ($request->has($field)) {
                $data[$field] = $request->input($field);
            }
        }
        $draft->update($data);

        return response()->json(['draft' => $draft->fresh()]);
    }

    /**
     * DELETE /api/drafts/{id}
     * Delete a draft.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        Draft::where('id', $id)
            ->where('user_id', $request->input('auth_user_id'))
            ->delete();

        return response()->json(['message' => 'Draft deleted.']);
    }
}
