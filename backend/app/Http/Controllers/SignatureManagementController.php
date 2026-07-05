<?php

namespace App\Http\Controllers;

use App\Models\EmailSignature;
use App\Models\SignatureTemplate;
use App\Models\ConnectedAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

class SignatureManagementController extends Controller
{
    /**
     * GET /api/admin/signature-templates
     * List all pre-made signature templates
     */
    public function listTemplates(): JsonResponse
    {
        $templates = SignatureTemplate::with('signatures')->get();

        return response()->json([
            'templates' => $templates,
        ]);
    }

    /**
     * POST /api/admin/signatures
     * Create custom signature from template or from scratch
     */
    public function createSignature(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'template_id' => 'nullable|exists:signature_templates,id',
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'html_content' => 'required|string',
            'variables_data' => 'nullable|array', // Pre-filled variable values
        ]);

        try {
            // Get user ID from JWT middleware (set as auth_user_id in request)
            $userId = $request->get('auth_user_id') ?? Auth::id();

            $signature = EmailSignature::create([
                'template_id' => $validated['template_id'] ?? null,
                'name' => $validated['name'],
                'description' => $validated['description'] ?? null,
                'html_content' => $validated['html_content'],
                'variables_data' => $validated['variables_data'] ?? [],
                'created_by' => $userId,
            ]);

            Log::info("Signature created: {$signature->id} - {$signature->name}");

            return response()->json([
                'message' => 'Signature created successfully',
                'signature' => $signature,
            ], 201);
        } catch (\Exception $e) {
            Log::error('Failed to create signature: ' . $e->getMessage());
            return response()->json([
                'error' => 'creation_failed',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * GET /api/admin/signatures
     * List all custom signatures
     */
    public function listSignatures(): JsonResponse
    {
        $signatures = EmailSignature::with('template', 'creator', 'accounts')
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'signatures' => $signatures,
        ]);
    }

    /**
     * GET /api/admin/signatures/{id}
     * Get single signature details
     */
    public function getSignature(int $id): JsonResponse
    {
        $signature = EmailSignature::with('template', 'creator', 'accounts')->find($id);

        if (!$signature) {
            return response()->json(['error' => 'not_found'], 404);
        }

        return response()->json([
            'signature' => $signature,
        ]);
    }

    /**
     * PUT /api/admin/signatures/{id}
     * Update signature
     */
    public function updateSignature(Request $request, int $id): JsonResponse
    {
        $signature = EmailSignature::find($id);

        if (!$signature) {
            return response()->json(['error' => 'not_found'], 404);
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'html_content' => 'sometimes|string',
            'variables_data' => 'nullable|array',
        ]);

        try {
            $signature->update($validated);
            Log::info("Signature updated: {$signature->id}");

            return response()->json([
                'message' => 'Signature updated',
                'signature' => $signature,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to update signature: ' . $e->getMessage());
            return response()->json([
                'error' => 'update_failed',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * DELETE /api/admin/signatures/{id}
     * Delete signature
     */
    public function deleteSignature(int $id): JsonResponse
    {
        $signature = EmailSignature::find($id);

        if (!$signature) {
            return response()->json(['error' => 'not_found'], 404);
        }

        try {
            $signature->delete();
            Log::info("Signature deleted: {$id}");

            return response()->json(['message' => 'Signature deleted']);
        } catch (\Exception $e) {
            Log::error('Failed to delete signature: ' . $e->getMessage());
            return response()->json([
                'error' => 'delete_failed',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * POST /api/admin/accounts/{id}/assign-signature
     * Assign signature to account
     */
    public function assignSignatureToAccount(Request $request, int $id): JsonResponse
    {
        $account = ConnectedAccount::find($id);

        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $validated = $request->validate([
            'signature_id' => 'required|exists:email_signatures,id',
            'is_default' => 'boolean',
        ]);

        try {
            // If setting as default, unset other defaults
            if ($validated['is_default'] ?? false) {
                $account->signatures()->update(['is_default' => false]);
            }

            // Attach or update signature
            $account->signatures()->syncWithoutDetaching([
                $validated['signature_id'] => [
                    'is_default' => $validated['is_default'] ?? false,
                ]
            ]);

            return response()->json([
                'message' => 'Signature assigned to account',
                'signatures' => $account->signatures,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to assign signature: ' . $e->getMessage());
            return response()->json([
                'error' => 'assignment_failed',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * DELETE /api/admin/accounts/{id}/unassign-signature
     * Unassign signature from account
     */
    public function unassignSignatureFromAccount(Request $request, int $id): JsonResponse
    {
        $account = ConnectedAccount::find($id);

        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $validated = $request->validate([
            'signature_id' => 'required|exists:email_signatures,id',
        ]);

        try {
            $account->signatures()->detach($validated['signature_id']);

            return response()->json([
                'message' => 'Signature unassigned from account',
                'signatures' => $account->signatures,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to unassign signature: ' . $e->getMessage());
            return response()->json([
                'error' => 'unassign_failed',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * GET /api/admin/accounts/{id}/signatures
     * Get signatures assigned to an account
     */
    public function getAccountSignatures(int $id): JsonResponse
    {
        $account = ConnectedAccount::find($id);

        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        $signatures = $account->signatures()
            ->with('template')
            ->get();

        return response()->json([
            'account_id' => $id,
            'signatures' => $signatures,
            'default_signature' => $account->signatures()->wherePivot('is_default', true)->first(),
        ]);
    }

    /**
     * POST /api/admin/signatures/{id}/render
     * Preview signature with variables filled in
     */
    public function renderSignature(Request $request, int $id): JsonResponse
    {
        $signature = EmailSignature::find($id);

        if (!$signature) {
            return response()->json(['error' => 'not_found'], 404);
        }

        $variables = $request->input('variables', []);
        $rendered = $signature->render($variables);

        return response()->json([
            'rendered_html' => $rendered,
        ]);
    }
}
