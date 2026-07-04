<?php

namespace App\Http\Controllers;

use App\Models\ConnectedAccount;
use App\Models\OutlookRule;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class RuleController extends Controller
{
    public function listByAccount($accountId): JsonResponse
    {
        $account = ConnectedAccount::findOrFail($accountId);
        $rules = $account->rules()->orderBy('sequence')->get();

        return response()->json([
            'rules' => $rules,
            'total' => $rules->count(),
        ]);
    }

    public function store(Request $request, $accountId): JsonResponse
    {
        $account = ConnectedAccount::findOrFail($accountId);

        $validated = $request->validate([
            'display_name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'conditions' => 'required|array',
            'actions' => 'required|array',
            'is_enabled' => 'boolean',
        ]);

        try {
            // Create rule in Outlook via Graph API
            $graphRule = $account->graphRequest('POST', '/mailFolders/inbox/messageRules', [
                'displayName' => $validated['display_name'],
                'sequence' => OutlookRule::where('account_id', $accountId)->max('sequence') + 1,
                'isEnabled' => $validated['is_enabled'] ?? true,
                'conditions' => $validated['conditions'],
                'actions' => $validated['actions'],
            ]);

            // Store locally
            $rule = OutlookRule::create([
                'account_id' => $accountId,
                'outlook_rule_id' => $graphRule['id'] ?? null,
                'display_name' => $validated['display_name'],
                'description' => $validated['description'],
                'conditions' => $validated['conditions'],
                'actions' => $validated['actions'],
                'is_enabled' => $validated['is_enabled'] ?? true,
                'sequence' => $graphRule['sequence'] ?? 1,
            ]);

            return response()->json(['rule' => $rule], 201);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    public function show($accountId, $ruleId): JsonResponse
    {
        $rule = OutlookRule::where('account_id', $accountId)
            ->where('id', $ruleId)
            ->firstOrFail();

        return response()->json(['rule' => $rule]);
    }

    public function update(Request $request, $accountId, $ruleId): JsonResponse
    {
        $rule = OutlookRule::where('account_id', $accountId)
            ->where('id', $ruleId)
            ->firstOrFail();

        $validated = $request->validate([
            'display_name' => 'string|max:255',
            'description' => 'nullable|string',
            'conditions' => 'array',
            'actions' => 'array',
            'is_enabled' => 'boolean',
            'sequence' => 'integer|min:1',
        ]);

        try {
            // Update in Outlook
            if ($rule->outlook_rule_id) {
                $account = $rule->account;
                $account->graphRequest('PATCH', '/mailFolders/inbox/messageRules/' . $rule->outlook_rule_id, [
                    'displayName' => $validated['display_name'] ?? $rule->display_name,
                    'isEnabled' => $validated['is_enabled'] ?? $rule->is_enabled,
                    'conditions' => $validated['conditions'] ?? $rule->conditions,
                    'actions' => $validated['actions'] ?? $rule->actions,
                    'sequence' => $validated['sequence'] ?? $rule->sequence,
                ]);
            }

            // Update locally
            $rule->update($validated);

            return response()->json(['rule' => $rule]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    public function destroy($accountId, $ruleId): JsonResponse
    {
        $rule = OutlookRule::where('account_id', $accountId)
            ->where('id', $ruleId)
            ->firstOrFail();

        try {
            // Delete from Outlook
            if ($rule->outlook_rule_id) {
                $account = $rule->account;
                $account->graphRequest('DELETE', '/mailFolders/inbox/messageRules/' . $rule->outlook_rule_id);
            }

            // Delete locally
            $rule->delete();

            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    public function toggleEnabled($accountId, $ruleId): JsonResponse
    {
        $rule = OutlookRule::where('account_id', $accountId)
            ->where('id', $ruleId)
            ->firstOrFail();

        try {
            $newStatus = !$rule->is_enabled;

            // Update in Outlook
            if ($rule->outlook_rule_id) {
                $account = $rule->account;
                $account->graphRequest('PATCH', '/mailFolders/inbox/messageRules/' . $rule->outlook_rule_id, [
                    'isEnabled' => $newStatus,
                ]);
            }

            // Update locally
            $rule->update(['is_enabled' => $newStatus]);

            return response()->json(['rule' => $rule]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    public function syncWithOutlook($accountId): JsonResponse
    {
        $account = ConnectedAccount::findOrFail($accountId);

        try {
            // Fetch all rules from Outlook
            $response = $account->graphRequest('GET', '/mailFolders/inbox/messageRules');

            $graphRules = $response['value'] ?? [];

            // Delete local rules that no longer exist in Outlook
            $graphRuleIds = array_column($graphRules, 'id');
            OutlookRule::where('account_id', $accountId)
                ->whereNotIn('outlook_rule_id', $graphRuleIds)
                ->delete();

            // Sync from Outlook
            foreach ($graphRules as $graphRule) {
                OutlookRule::updateOrCreate(
                    [
                        'account_id' => $accountId,
                        'outlook_rule_id' => $graphRule['id'],
                    ],
                    [
                        'display_name' => $graphRule['displayName'],
                        'conditions' => $graphRule['conditions'] ?? [],
                        'actions' => $graphRule['actions'] ?? [],
                        'is_enabled' => $graphRule['isEnabled'] ?? true,
                        'sequence' => $graphRule['sequence'] ?? 1,
                    ]
                );
            }

            $rules = OutlookRule::where('account_id', $accountId)
                ->orderBy('sequence')
                ->get();

            return response()->json(['rules' => $rules, 'synced' => count($graphRules)]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    public function getFolders($accountId): JsonResponse
    {
        $account = ConnectedAccount::findOrFail($accountId);

        try {
            $response = $account->graphRequest('GET', '/mailFolders');
            $folders = $response['value'] ?? [];

            return response()->json(['folders' => $folders]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }
}
