<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Services\SignatureService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

class SignatureController extends Controller
{
    /**
     * GET /api/accounts/{id}/signature
     * Fetch account signature
     */
    public function getSignature(int $id): JsonResponse
    {
        $account = Account::find($id);

        if (!$account) {
            return response()->json(['error' => 'Account not found'], 404);
        }

        try {
            // Get signature from Graph API
            $signature = SignatureService::getSignature($account->access_token);

            // Cache it in the database for quick access
            if ($signature) {
                $account->update(['signature' => $signature]);
            }

            return response()->json([
                'signature' => $signature,
                'formatted' => SignatureService::formatSignature($signature, $account->email),
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to fetch signature: ' . $e->getMessage());
            return response()->json([
                'error' => 'Failed to fetch signature',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/accounts/signatures/batch
     * Fetch signatures for multiple accounts
     */
    public function getSignaturesBatch(array $accountIds): JsonResponse
    {
        try {
            $accounts = Account::whereIn('id', $accountIds)->get();

            $signatures = [];
            foreach ($accounts as $account) {
                $signature = SignatureService::getSignature($account->access_token);

                if ($signature) {
                    $account->update(['signature' => $signature]);
                }

                $signatures[$account->id] = [
                    'email' => $account->email,
                    'signature' => $signature,
                    'formatted' => SignatureService::formatSignature($signature, $account->email),
                ];
            }

            return response()->json(['signatures' => $signatures]);
        } catch (\Exception $e) {
            Log::error('Failed to fetch signatures: ' . $e->getMessage());
            return response()->json([
                'error' => 'Failed to fetch signatures',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
