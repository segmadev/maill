<?php

namespace App\Http\Controllers;

use App\Models\ConnectedAccount;
use App\Models\OutlookRule;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class RuleController extends Controller
{
    /**
     * Convert Microsoft Graph format back to frontend format for editing
     * Microsoft Graph: { "fromAddresses": [...], "hasAttachments": true }
     * Frontend: [{ "key": "fromAddresses", "value": [...] }, ...]
     */
    private function convertConditionsToFrontend($graphFormat): array
    {
        if (is_array($graphFormat) && !empty($graphFormat)) {
            // Check if it's already in frontend format
            if (isset($graphFormat[0]['key'])) {
                return $graphFormat;
            }
        }

        // Convert from Microsoft Graph format to frontend format
        $conditions = [];
        if (is_array($graphFormat) || is_object($graphFormat)) {
            foreach ((array)$graphFormat as $key => $value) {
                // Extract actual values from nested Microsoft Graph structures
                $extractedValue = $this->extractConditionValue($key, $value);

                $conditions[] = [
                    'key' => $key,
                    'value' => $extractedValue,
                ];
            }
        }
        return $conditions;
    }

    /**
     * Extract the actual value from Microsoft Graph condition format
     * E.g., fromAddresses: [{ emailAddress: { address: "..." } }] -> ["email@example.com"]
     */
    private function extractConditionValue($key, $value)
    {
        if ($key === 'fromAddresses' || $key === 'toAddresses') {
            // Extract email addresses from nested structure
            if (is_array($value)) {
                return array_map(function ($item) {
                    if (is_array($item) && isset($item['emailAddress']['address'])) {
                        return $item['emailAddress']['address'];
                    } elseif (is_object($item) && isset($item->emailAddress->address)) {
                        return $item->emailAddress->address;
                    }
                    return $item;
                }, $value);
            }
        }

        return $value;
    }

    /**
     * Convert Microsoft Graph format back to frontend format for editing
     * Microsoft Graph: { "moveToFolder": "id", "assignCategories": [...] }
     * Frontend: [{ "key": "moveToFolder", "value": "id" }, ...]
     */
    private function convertActionsToFrontend($graphFormat): array
    {
        if (is_array($graphFormat) && !empty($graphFormat)) {
            // Check if it's already in frontend format
            if (isset($graphFormat[0]['key'])) {
                return $graphFormat;
            }
        }

        // Convert from Microsoft Graph format to frontend format
        $actions = [];
        if (is_array($graphFormat) || is_object($graphFormat)) {
            foreach ((array)$graphFormat as $key => $value) {
                $actions[] = [
                    'key' => $key,
                    'value' => $value,
                ];
            }
        }
        return $actions;
    }

    /**
     * Transform conditions from frontend format to Graph API format
     * Frontend: [{ key: 'fromAddresses', value: ['email@example.com'] }, { key: 'hasAttachments', value: true }]
     * Graph API: { fromAddresses: ['email@example.com'], hasAttachments: true }
     */
    private function transformConditions(array $conditions): array
    {
        $result = [];
        foreach ($conditions as $condition) {
            $key = $condition['key'] ?? null;
            $value = $condition['value'] ?? null;

            if (!$key) continue;

            // Handle different types of values
            if (is_array($value)) {
                // Filter out empty strings from arrays
                $filtered = array_filter($value, fn($v) => $v !== '' && $v !== null);
                if (!empty($filtered)) {
                    $result[$key] = array_values($filtered);
                }
            } elseif ($value === true) {
                // Boolean true is always valid
                $result[$key] = true;
            } elseif ($value === false) {
                // Boolean false - skip it, as it means "not this condition"
                continue;
            } elseif ($value !== null && $value !== '') {
                // String values
                $result[$key] = $value;
            }
        }
        return $result;
    }

    /**
     * Transform actions from frontend format to Graph API format
     * Frontend: [{ key: 'moveToFolder', value: 'folderId' }]
     * Graph API: { moveToFolder: 'folderId' }
     */
    private function transformActions(array $actions): array
    {
        $result = [];
        foreach ($actions as $action) {
            $key = $action['key'] ?? null;
            $value = $action['value'] ?? null;

            if (!$key) continue;

            // Handle different types of values
            if (is_array($value)) {
                // Filter out empty strings from arrays
                $filtered = array_filter($value, fn($v) => $v !== '' && $v !== null);
                if (!empty($filtered)) {
                    $result[$key] = array_values($filtered);
                }
            } elseif ($value === true) {
                // Boolean true is always valid
                $result[$key] = true;
            } elseif ($value === false) {
                // Boolean false - skip it
                continue;
            } elseif ($value !== null && $value !== '') {
                // String values (folder IDs, email addresses, etc.)
                // These go directly as the value, not wrapped in an object
                $result[$key] = $value;
            }
        }
        return $result;
    }

    public function listByAccount($accountId): JsonResponse
    {
        $account = ConnectedAccount::findOrFail($accountId);
        $rules = $account->rules()->orderBy('sequence')->get()
            ->map(function ($rule) {
                $rule->conditions = $this->convertConditionsToFrontend($rule->conditions);
                $rule->actions = $this->convertActionsToFrontend($rule->actions);
                return $rule;
            });

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
            // Validate we have at least one condition and one action
            if (empty($validated['conditions'])) {
                return response()->json(['error' => 'At least one condition is required'], 422);
            }
            if (empty($validated['actions'])) {
                return response()->json(['error' => 'At least one action is required'], 422);
            }

            // Transform conditions and actions to Graph API format
            $graphConditions = $this->transformConditions($validated['conditions']);
            $graphActions = $this->transformActions($validated['actions']);

            // Validate transformed conditions/actions are not empty
            if (empty($graphConditions)) {
                return response()->json(['error' => 'Conditions are empty after validation. Please ensure all condition values are filled.'], 422);
            }
            if (empty($graphActions)) {
                return response()->json(['error' => 'Actions are empty after validation. Please ensure all action values are filled.'], 422);
            }

            // Prepare payload for Graph API
            $sequence = (OutlookRule::where('account_id', $accountId)->max('sequence') ?? 0) + 1;

            // Build conditions and actions as objects with specific properties
            // Microsoft expects: { "fromAddresses": [...], "subject": [...] }
            $payload = [
                'displayName' => $validated['display_name'],
                'sequence' => $sequence,
                'isEnabled' => (bool)($validated['is_enabled'] ?? true),
            ];

            // Only add conditions if we have any
            if (!empty($graphConditions)) {
                $payload['conditions'] = $graphConditions;
            }

            // Only add actions if we have any
            if (!empty($graphActions)) {
                $payload['actions'] = $graphActions;
            }

            // Log the payload for debugging
            \Log::info('Creating Outlook rule', [
                'account_id' => $accountId,
                'display_name' => $validated['display_name'],
                'conditions_count' => count($graphConditions),
                'actions_count' => count($graphActions),
                'payload_json' => json_encode($payload),
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

        // Convert to frontend format for editing
        $rule->conditions = $this->convertConditionsToFrontend($rule->conditions);
        $rule->actions = $this->convertActionsToFrontend($rule->actions);

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

                // Validate we have conditions and actions
                if (empty($conditions) || empty($actions)) {
                    return response()->json([
                        'error' => 'Rules must have at least one condition and one action'
                    ], 422);
                }

                // Transform conditions and actions to Graph API format
                $graphConditions = $this->transformConditions($conditions);
                $graphActions = $this->transformActions($actions);

                // Validate transformed conditions/actions are not empty
                if (empty($graphConditions) || empty($graphActions)) {
                    return response()->json([
                        'error' => 'Invalid conditions or actions. Please ensure all values are filled.'
                    ], 422);
                }

                $updatePayload = [
                    'displayName' => $validated['display_name'] ?? $rule->display_name,
                    'isEnabled' => $validated['is_enabled'] ?? $rule->is_enabled,
                    'sequence' => $validated['sequence'] ?? $rule->sequence,
                ];

                // Only add conditions if we have any
                if (!empty($graphConditions)) {
                    $updatePayload['conditions'] = $graphConditions;
                }

                // Only add actions if we have any
                if (!empty($graphActions)) {
                    $updatePayload['actions'] = $graphActions;
                }

                $account->graphRequest('PATCH', '/me/mailFolders/inbox/messageRules/' . $rule->outlook_rule_id, $updatePayload);
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
