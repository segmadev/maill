<?php

namespace App\Http\Controllers;

use App\Models\BulkCampaign;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class BulkCampaignController extends Controller
{
    /**
     * GET /api/bulk-campaigns
     * List all campaigns with optional filtering
     */
    public function index(Request $request): JsonResponse
    {
        $query = BulkCampaign::query();

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }

        // Filter by date range
        if ($request->has('from')) {
            $query->where('created_at', '>=', $request->input('from'));
        }
        if ($request->has('to')) {
            $query->where('created_at', '<=', $request->input('to'));
        }

        // Sort by creation date descending
        $campaigns = $query->orderByDesc('created_at')->paginate(20);

        return response()->json([
            'campaigns' => $campaigns->items(),
            'pagination' => [
                'total' => $campaigns->total(),
                'per_page' => $campaigns->perPage(),
                'current_page' => $campaigns->currentPage(),
                'last_page' => $campaigns->lastPage(),
            ]
        ]);
    }

    /**
     * POST /api/bulk-campaigns
     * Create a new bulk campaign (save draft)
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'subject' => 'required|string',
            'body' => 'required|string',
            'selected_accounts' => 'required|array|min:1',
            'recipients' => 'required|array|min:1',
            'base64_fields' => 'nullable|array',
            'campaign_settings' => 'required|array',
        ]);

        try {
            $campaign = BulkCampaign::create([
                'name' => $validated['name'],
                'subject' => $validated['subject'],
                'body' => $validated['body'],
                'selected_accounts' => $validated['selected_accounts'],
                'recipients' => $validated['recipients'],
                'base64_fields' => $validated['base64_fields'] ?? [],
                'campaign_settings' => $validated['campaign_settings'],
                'total_recipients' => count($validated['recipients']),
                'status' => 'draft',
                'created_by' => $request->user()?->name ?? 'System',
            ]);

            Log::info("Bulk campaign created: {$campaign->id} - {$campaign->name}");

            return response()->json([
                'message' => 'Campaign created successfully',
                'campaign' => $campaign,
            ], 201);
        } catch (\Exception $e) {
            Log::error('Failed to create bulk campaign: ' . $e->getMessage());
            return response()->json([
                'error' => 'campaign_creation_failed',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * GET /api/bulk-campaigns/{id}
     * Get campaign details
     */
    public function show(int $id): JsonResponse
    {
        $campaign = BulkCampaign::find($id);

        if (!$campaign) {
            return response()->json([
                'error' => 'not_found',
                'message' => 'Campaign not found',
            ], 404);
        }

        return response()->json(['campaign' => $campaign]);
    }

    /**
     * PATCH /api/bulk-campaigns/{id}
     * Update campaign (status, progress, etc.)
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $campaign = BulkCampaign::find($id);

        if (!$campaign) {
            return response()->json([
                'error' => 'not_found',
                'message' => 'Campaign not found',
            ], 404);
        }

        $validated = $request->validate([
            'status' => 'nullable|in:draft,queued,running,paused,completed,failed,cancelled',
            'processed_count' => 'nullable|integer',
            'sent_count' => 'nullable|integer',
            'failed_count' => 'nullable|integer',
            'started_at' => 'nullable|date',
            'paused_at' => 'nullable|date',
            'completed_at' => 'nullable|date',
            'batch_history' => 'nullable|array',
            'failed_recipients' => 'nullable|array',
        ]);

        // Handle status transitions
        if (isset($validated['status'])) {
            if ($validated['status'] === 'running' && !$campaign->started_at) {
                $validated['started_at'] = now();
            }
            if ($validated['status'] === 'completed' && !$campaign->completed_at) {
                $validated['completed_at'] = now();
            }
            if ($validated['status'] === 'paused' && !$campaign->paused_at) {
                $validated['paused_at'] = now();
            }
        }

        $campaign->update($validated);

        return response()->json([
            'message' => 'Campaign updated',
            'campaign' => $campaign,
        ]);
    }

    /**
     * DELETE /api/bulk-campaigns/{id}
     * Delete campaign
     */
    public function destroy(int $id): JsonResponse
    {
        $campaign = BulkCampaign::find($id);

        if (!$campaign) {
            return response()->json([
                'error' => 'not_found',
                'message' => 'Campaign not found',
            ], 404);
        }

        if ($campaign->status === 'running') {
            return response()->json([
                'error' => 'campaign_running',
                'message' => 'Cannot delete a running campaign. Cancel it first.',
            ], 422);
        }

        $campaign->delete();

        return response()->json(['message' => 'Campaign deleted']);
    }

    /**
     * POST /api/bulk-campaigns/{id}/start
     * Start/resume a campaign with allocation strategy
     */
    public function start(Request $request, int $id): JsonResponse
    {
        $campaign = BulkCampaign::find($id);

        if (!$campaign) {
            return response()->json(['error' => 'not_found'], 404);
        }

        // Check if another campaign is running on the same accounts
        $runningCampaigns = BulkCampaign::where('status', 'running')
            ->where('id', '!=', $id)
            ->get();

        foreach ($runningCampaigns as $running) {
            $overlap = array_intersect(
                $campaign->selected_accounts,
                $running->selected_accounts
            );
            if (!empty($overlap)) {
                return response()->json([
                    'error' => 'account_busy',
                    'message' => 'One or more selected accounts are already sending another campaign.',
                ], 422);
            }
        }

        try {
            // Apply allocation strategy if not already allocated
            if (empty($campaign->recipient_tracking)) {
                $allocationService = new \App\Services\AllocationStrategyService();
                $strategy = $campaign->campaign_settings['allocationStrategy'] ?? 'round-robin';
                $customDistribution = $campaign->campaign_settings['customDistribution'] ?? null;

                $tracking = $allocationService->allocate(
                    $campaign->recipients,
                    $campaign->selected_accounts,
                    $strategy,
                    $customDistribution
                );

                $campaign->update(['recipient_tracking' => $tracking]);
            }

            // Update status
            $campaign->update([
                'status' => 'running',
                'started_at' => $campaign->started_at ?? now(),
            ]);

            // Refresh to get latest data
            $campaign->refresh();

            Log::info("Campaign {$id} started with allocation strategy");

            return response()->json(['campaign' => $campaign]);
        } catch (\Exception $e) {
            Log::error('Failed to start campaign: ' . $e->getMessage());
            return response()->json([
                'error' => 'start_failed',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * POST /api/bulk-campaigns/{id}/pause
     * Pause a campaign
     */
    public function pause(int $id): JsonResponse
    {
        $campaign = BulkCampaign::find($id);

        if (!$campaign) {
            return response()->json(['error' => 'not_found'], 404);
        }

        $campaign->update([
            'status' => 'paused',
            'paused_at' => now(),
        ]);

        return response()->json(['campaign' => $campaign]);
    }

    /**
     * POST /api/bulk-campaigns/{id}/cancel
     * Cancel a campaign
     */
    public function cancel(int $id): JsonResponse
    {
        $campaign = BulkCampaign::find($id);

        if (!$campaign) {
            return response()->json(['error' => 'not_found'], 404);
        }

        $campaign->update(['status' => 'cancelled']);

        return response()->json(['campaign' => $campaign]);
    }

    /**
     * POST /api/bulk-campaigns/{id}/update-batch
     * Update campaign progress after a batch is sent
     */
    public function updateBatch(Request $request, int $id): JsonResponse
    {
        $campaign = BulkCampaign::find($id);

        if (!$campaign) {
            return response()->json(['error' => 'not_found'], 404);
        }

        $validated = $request->validate([
            'batch_num' => 'required|integer',
            'sent' => 'required|integer',
            'failed' => 'nullable|array',
            'duration_ms' => 'required|integer',
        ]);

        try {
            // Get current batch history
            $batchHistory = $campaign->batch_history ?? [];

            // Add new batch
            $batchHistory[] = [
                'batchNum' => $validated['batch_num'],
                'sent' => $validated['sent'],
                'failed' => $validated['failed'] ?? [],
                'durationMs' => $validated['duration_ms'],
                'sentAt' => now()->toIso8601String(),
            ];

            // Update campaign totals
            $failedCount = collect($validated['failed'] ?? [])->count();

            $campaign->update([
                'batch_history' => $batchHistory,
                'processed_count' => $campaign->processed_count + $validated['sent'] + $failedCount,
                'sent_count' => $campaign->sent_count + $validated['sent'],
                'failed_count' => $campaign->failed_count + $failedCount,
                'failed_recipients' => array_merge(
                    $campaign->failed_recipients ?? [],
                    $validated['failed'] ?? []
                ),
            ]);

            // Auto-complete if all processed
            if ($campaign->processed_count >= $campaign->total_recipients) {
                $campaign->update([
                    'status' => 'completed',
                    'completed_at' => now(),
                ]);
            }

            Log::info("Batch {$validated['batch_num']} updated for campaign {$id}");

            return response()->json(['campaign' => $campaign]);
        } catch (\Exception $e) {
            Log::error('Failed to update campaign batch: ' . $e->getMessage());
            return response()->json([
                'error' => 'update_failed',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * POST /api/bulk-campaigns/{id}/resend-recipients
     * Resend emails to selected recipients
     */
    public function resendRecipients(Request $request, int $id): JsonResponse
    {
        $campaign = BulkCampaign::find($id);

        if (!$campaign) {
            return response()->json(['error' => 'not_found'], 404);
        }

        $validated = $request->validate([
            'emails' => 'required|array|min:1',
            'emails.*' => 'required|email',
        ]);

        try {
            $tracking = $campaign->recipient_tracking ?? [];
            $updated = false;

            foreach ($tracking as &$recipient) {
                if (in_array($recipient['email'], $validated['emails'])) {
                    $recipient['status'] = 'pending';
                    $recipient['reason'] = null;
                    $updated = true;
                }
            }

            if ($updated) {
                $campaign->update(['recipient_tracking' => $tracking]);
                Log::info("Resending " . count($validated['emails']) . " recipients for campaign {$id}");
            }

            return response()->json([
                'message' => 'Recipients queued for resending',
                'campaign' => $campaign,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to resend recipients: ' . $e->getMessage());
            return response()->json([
                'error' => 'resend_failed',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * POST /api/bulk-campaigns/{id}/resend-batch
     * Resend all emails from a specific batch
     */
    public function resendBatch(Request $request, int $id): JsonResponse
    {
        $campaign = BulkCampaign::find($id);

        if (!$campaign) {
            return response()->json(['error' => 'not_found'], 404);
        }

        $validated = $request->validate([
            'batch_num' => 'required|integer',
        ]);

        try {
            $batchNum = $validated['batch_num'];
            $batch = collect($campaign->batch_history ?? [])->firstWhere('batchNum', $batchNum);

            if (!$batch) {
                return response()->json([
                    'error' => 'batch_not_found',
                    'message' => "Batch #{$batchNum} not found",
                ], 404);
            }

            $tracking = $campaign->recipient_tracking ?? [];
            $updated = false;

            // Reset status for all recipients that were in this batch
            foreach ($tracking as &$recipient) {
                $recipient['status'] = 'pending';
                $recipient['reason'] = null;
                $updated = true;
            }

            if ($updated) {
                $campaign->update(['recipient_tracking' => $tracking]);
                Log::info("Resending batch #{$batchNum} for campaign {$id}");
            }

            return response()->json([
                'message' => "Batch #{$batchNum} queued for resending",
                'campaign' => $campaign,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to resend batch: ' . $e->getMessage());
            return response()->json([
                'error' => 'resend_failed',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * POST /api/bulk-campaigns/{id}/update-recipient-tracking
     * Update status of recipients in the campaign's tracking
     */
    public function updateRecipientTracking(Request $request, int $id): JsonResponse
    {
        $campaign = BulkCampaign::find($id);

        if (!$campaign) {
            return response()->json(['error' => 'not_found'], 404);
        }

        $validated = $request->validate([
            'updates' => 'required|array',
            'updates.*.email' => 'required|email',
            'updates.*.status' => 'required|in:pending,sent,failed',
            'updates.*.reason' => 'nullable|string',
        ]);

        try {
            $tracking = $campaign->recipient_tracking ?? [];
            $emailsToUpdate = collect($validated['updates'])->keyBy('email');

            // Update status for each recipient
            foreach ($tracking as &$recipient) {
                if (isset($emailsToUpdate[$recipient['email']])) {
                    $update = $emailsToUpdate[$recipient['email']];
                    $recipient['status'] = $update['status'];
                    $recipient['reason'] = $update['reason'] ?? null;
                }
            }

            $campaign->update(['recipient_tracking' => $tracking]);

            return response()->json([
                'message' => 'Recipient tracking updated',
                'campaign' => $campaign,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to update recipient tracking: ' . $e->getMessage());
            return response()->json([
                'error' => 'update_failed',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * POST /api/bulk-campaigns/{id}/replay
     * Reset a completed campaign to draft status to resend
     */
    public function replay(Request $request, int $id): JsonResponse
    {
        $campaign = BulkCampaign::find($id);

        if (!$campaign) {
            return response()->json(['error' => 'not_found', 'message' => 'Campaign not found'], 404);
        }

        // Only allow replaying completed, cancelled, or paused campaigns
        if (!in_array($campaign->status, ['completed', 'cancelled', 'paused', 'failed'])) {
            return response()->json([
                'error' => 'invalid_status',
                'message' => "Cannot replay a campaign with status: {$campaign->status}",
            ], 422);
        }

        try {
            // Reset campaign to draft status
            $campaign->update([
                'status' => 'draft',
                'started_at' => null,
                'completed_at' => null,
                'paused_at' => null,
                'sent_count' => 0,
                'failed_count' => 0,
                'bounced_count' => 0,
                'complaint_count' => 0,
                'recipient_tracking' => null, // Clear tracking so it starts fresh
            ]);

            Log::info("Campaign {$campaign->id} replayed by user {$request->user()?->id}");

            return response()->json([
                'message' => 'Campaign reset to draft. Click "Start" to send again.',
                'campaign' => $this->formatCampaign($campaign),
            ]);
        } catch (\Exception $e) {
            Log::error("Failed to replay campaign {$id}: {$e->getMessage()}");
            return response()->json([
                'error' => 'replay_failed',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Format campaign for API response
     */
    private function formatCampaign(BulkCampaign $campaign): array
    {
        return [
            'id' => $campaign->id,
            'name' => $campaign->name,
            'status' => $campaign->status,
            'subject' => $campaign->subject,
            'body' => $campaign->body,
            'html_body' => $campaign->html_body,
            'recipient_count' => $campaign->recipient_count,
            'total_recipients' => $campaign->recipient_count,
            'sent_count' => $campaign->sent_count,
            'failed_count' => $campaign->failed_count,
            'bounced_count' => $campaign->bounced_count,
            'complaint_count' => $campaign->complaint_count,
            'processed_count' => $campaign->sent_count + $campaign->failed_count,
            'importance_high' => $campaign->importance_high,
            'config' => $campaign->config,
            'account_ids' => $campaign->account_ids,
            'selected_accounts' => $campaign->account_ids,
            'recipient_distribution' => $campaign->recipient_distribution,
            'ip_rotation_strategy' => $campaign->ip_rotation_strategy,
            'ip_daily_limit' => $campaign->ip_daily_limit,
            'ip_warmup_enabled' => $campaign->ip_warmup_enabled,
            'reply_to_config' => $campaign->reply_to_config,
            'started_at' => $campaign->started_at?->toIso8601String(),
            'completed_at' => $campaign->completed_at?->toIso8601String(),
            'created_at' => $campaign->created_at?->toIso8601String(),
            'updated_at' => $campaign->updated_at?->toIso8601String(),
        ];
    }
}
