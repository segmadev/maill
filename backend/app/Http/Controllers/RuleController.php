<?php

namespace App\Http\Controllers;

use App\Models\ConnectedAccount;
use App\Models\OutlookRule;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class RuleController extends Controller
{
    /**
     * Transform conditions from frontend format to Graph API format
     * Frontend: [{ key: 'fromAddresses', value: ['email@example.com'] }]
     * Graph API: { fromAddresses: ['email@example.com'] }
     */
    private function transformConditions(array $conditions): array
    {
        $result = [];
        foreach ($conditions as $condition) {
            $key = $condition['key'] ?? null;
            $value = $condition['value'] ?? null;

            if ($key && $value !== null && $value !== '') {
                // Ensure arrays are properly formatted
                if (is_string($value)) {
                    $result[$key] = $value;
                } elseif (is_array($value)) {
                    // Filter out empty strings from arrays
                    $filtered = array_filter($value, fn($v) => $v !== '' && $v !== null);
                    if (!empty($filtered)) {
                        $result[$key] = array_values($filtered);
                    }
                } elseif ($value === true || $value === false) {
                    $result[$key] = $value;
                }
            }
        }
        return $result;
    }

    /**
     * Transform actions from frontend format to Graph API format
     * Frontend: [{ key: 'moveToFolder', value: 'folderId' }]
     * Graph API: { moveToFolder: { destinationId: 'folderId' } }
     */
    private function transformActions(array $actions): array
    {
        $result = [];
        foreach ($actions as $action) {
            $key = $action['key'] ?? null;
            $value = $action['value'] ?? null;

            if ($key && $value !== null && $value !== '') {
                // Special handling for moveToFolder
                if ($key === 'moveToFolder') {
                    $result[$key] = [
                        'destinationId' => $value,
                    ];
                } elseif (is_array($value)) {
                    // Filter out empty strings from arrays
                    $filtered = array_filter($value, fn($v) => $v !== '' && $v !== null);
                    if (!empty($filtered)) {
                        $result[$key] = array_values($filtered);
                    }
                } else {
                    $result[$key] = $value;
                }
            }
        }
        return $result;
    }

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
            // Transform conditions and actions to Graph API format
            $graphConditions = $this->transformConditions($validated['conditions']);
            $graphActions = $this->transformActions($validated['actions']);

            // Prepare payload for Graph API
            $payload = [
                'displayName' => $validated['display_name'],
                'sequence' => OutlookRule::where('account_id', $accountId)->max('sequence') + 1,
                'isEnabled' => $validated['is_enabled'] ?? true,
                'conditions' => $graphConditions,
                'actions' => $graphActions,
            ];

            // Log the payload for debugging
            \Log::info('Creating Outlook rule', [
                'account_id' => $accountId,
                'payload' => json_encode($payload),
            ]);

            // Create rule in Outlook via Graph API
            $graphRule = $account->graphRequest('POST', '/me/mailFolders/inbox/messageRules', $payload);

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
                $conditions = $validated['conditions'] ?? $rule->conditions;
                $actions = $validated['actions'] ?? $rule->actions;

                // Transform conditions and actions to Graph API format
                $graphConditions = $this->transformConditions($conditions);
                $graphActions = $this->transformActions($actions);

                $account->graphRequest('PATCH', '/me/mailFolders/inbox/messageRules/' . $rule->outlook_rule_id, [
                    'displayName' => $validated['display_name'] ?? $rule->display_name,
                    'isEnabled' => $validated['is_enabled'] ?? $rule->is_enabled,
                    'conditions' => $graphConditions,
                    'actions' => $graphActions,
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
                $account->graphRequest('DELETE', '/me/mailFolders/inbox/messageRules/' . $rule->outlook_rule_id);
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
                $account->graphRequest('PATCH', '/me/mailFolders/inbox/messageRules/' . $rule->outlook_rule_id, [
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
            $response = $account->graphRequest('GET', '/me/mailFolders/inbox/messageRules');

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
            $response = $account->graphRequest('GET', '/me/mailFolders');
            $folders = $response['value'] ?? [];

            return response()->json(['folders' => $folders]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }
}
