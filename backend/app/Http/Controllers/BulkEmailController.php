<?php

namespace App\Http\Controllers;

use App\Models\BulkEmailCampaign;
use App\Models\ConnectedAccount;
use App\Services\BulkEmailService;
use App\Services\EmailQueueService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class BulkEmailController extends Controller
{
    public function __construct(
        private BulkEmailService $bulkEmailService,
        private EmailQueueService $queueService,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'subject' => 'required|string|max:255',
            'body' => 'required|string',
            'html_body' => 'nullable|string',
            'account_ids' => 'required|array|min:1',
            'account_ids.*' => 'exists:connected_accounts,id',
            'selected_accounts' => 'nullable|array',
            'selected_accounts.*' => 'exists:connected_accounts,id',
            'config' => 'nullable|array',
            'campaign_settings' => 'nullable|array',
            'reply_to_config' => 'nullable|array',
            'importance_high' => 'nullable|boolean',
            'ip_rotation_strategy' => 'nullable|string|in:round-robin,load-based,reputation-based',
            'ip_daily_limit' => 'nullable|integer|min:50|max:5000',
            'ip_hourly_limit' => 'nullable|integer|min:5|max:500',
            'ip_warmup_enabled' => 'nullable|boolean',
            'status' => 'nullable|string|in:draft,submitted',
            'recipient_distribution' => 'nullable|string|in:round-robin,equal,sequential,load-based',
            'account_config' => 'nullable|array',
            'recipients' => 'nullable|array',
            'recipients.*.email' => 'email',
            'recipients.*.name' => 'nullable|string',
        ]);

        try {
            // Extract recipients from the request
            $recipients = $validated['recipients'] ?? [];
            unset($validated['recipients']);

            // Merge selected_accounts into account_ids if provided
            if (!empty($validated['selected_accounts']) && empty($validated['account_ids'])) {
                $validated['account_ids'] = $validated['selected_accounts'];
            }
            unset($validated['selected_accounts']);

            // Extract settings from campaign_settings
            $campaignSettings = $validated['campaign_settings'] ?? [];
            if (!empty($campaignSettings)) {
                // Set importance_high from markAsImportant (ensure it's a boolean)
                if (isset($campaignSettings['markAsImportant'])) {
                    $validated['importance_high'] = (bool) $campaignSettings['markAsImportant'];
                    Log::info("Campaign importance_high set to: " . ($validated['importance_high'] ? 'true' : 'false'));
                }

                // Extract signature settings and merge into config
                $signatureSettings = [
                    'signature_mode' => $campaignSettings['signatureMode'] ?? null,
                    'signature_id' => $campaignSettings['signatureId'] ?? null,
                    'include_signature' => $campaignSettings['includeSignature'] ?? true,
                ];
                // Merge signature settings with existing config
                $validated['config'] = array_merge($validated['config'] ?? [], $signatureSettings);

                // Extract allocation strategy and custom distribution
                if (isset($campaignSettings['allocationStrategy'])) {
                    $validated['recipient_distribution'] = $campaignSettings['allocationStrategy'];
                }

                // Store custom distribution in account_config
                if (isset($campaignSettings['customDistribution'])) {
                    $validated['account_config'] = $campaignSettings['customDistribution'];
                }
            }
            unset($validated['campaign_settings']);

            // Create campaign
            $campaign = $this->bulkEmailService->createCampaign($request->user(), $validated);

            // Add recipients if provided
            if (!empty($recipients)) {
                $this->bulkEmailService->addRecipients($campaign, $recipients);
                // Refresh campaign to get updated recipient count
                $campaign->refresh();
            }

            return response()->json([
                'message' => 'Campaign created successfully',
                'campaign' => $this->formatCampaign($campaign),
            ], 201);
        } catch (\Exception $e) {
            Log::error("Failed to create campaign: {$e->getMessage()}");
            return response()->json([
                'error' => 'creation_failed',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    public function index(Request $request): JsonResponse
    {
        $perPage = min((int) $request->query('per_page', 20), 100);
        $status = $request->query('status');
        $query = BulkEmailCampaign::where('user_id', $request->user()->id);

        if ($status) {
            $query->where('status', $status);
        }

        $campaigns = $query->orderByDesc('created_at')->paginate($perPage);
        return response()->json([
            'campaigns' => $campaigns->items(),
            'total' => $campaigns->total(),
            'current_page' => $campaigns->currentPage(),
            'last_page' => $campaigns->lastPage(),
            'per_page' => $campaigns->perPage(),
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $campaign = BulkEmailCampaign::where('user_id', $request->user()->id)->find($id);
        if (!$campaign) {
            return response()->json(['error' => 'not_found', 'message' => 'Campaign not found'], 404);
        }

        return response()->json([
            'campaign' => $this->formatCampaign($campaign),
            'stats' => $this->bulkEmailService->getStats($campaign),
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $campaign = BulkEmailCampaign::where('user_id', $request->user()->id)->find($id);
        if (!$campaign) {
            return response()->json(['error' => 'not_found', 'message' => 'Campaign not found'], 404);
        }

        $action = $request->input('action');
        try {
            match ($action) {
                'start' => $this->bulkEmailService->startCampaign($campaign),
                'pause' => $this->bulkEmailService->pauseCampaign($campaign),
                'resume' => $this->bulkEmailService->resumeCampaign($campaign),
                'cancel' => $this->bulkEmailService->cancelCampaign($campaign),
                default => throw new \Exception('Invalid action'),
            };

            return response()->json([
                'message' => "Campaign {$action}ed successfully",
                'campaign' => $this->formatCampaign($campaign->fresh()),
            ]);
        } catch (\Exception $e) {
            Log::error("Failed to {$action} campaign {$id}: {$e->getMessage()}");
            return response()->json([
                'error' => 'action_failed',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $campaign = BulkEmailCampaign::where('user_id', $request->user()->id)->find($id);
        if (!$campaign) {
            return response()->json(['error' => 'not_found', 'message' => 'Campaign not found'], 404);
        }

        if (in_array($campaign->status, ['running', 'completed'])) {
            return response()->json([
                'error' => 'cannot_delete',
                'message' => 'Cannot delete campaign that is running or completed',
            ], 422);
        }

        $campaign->delete();
        return response()->json(['message' => 'Campaign deleted successfully']);
    }

    public function generateQueue(Request $request, int $id): JsonResponse
    {
        $campaign = BulkEmailCampaign::where('user_id', $request->user()->id)->find($id);
        if (!$campaign) {
            return response()->json(['error' => 'not_found', 'message' => 'Campaign not found'], 404);
        }

        $validated = $request->validate([
            'recipients' => 'required|array|min:1|max:10000',
            'recipients.*.email' => 'required|email',
            'recipients.*.name' => 'nullable|string',
            'recipients.*.group' => 'nullable|string',
        ]);

        try {
            $count = $this->queueService->generateQueue($campaign, $validated['recipients']);
            return response()->json([
                'message' => "{$count} recipients added to queue",
                'count' => $count,
                'total_in_queue' => $campaign->recipient_count,
            ]);
        } catch (\Exception $e) {
            Log::error("Failed to generate queue for campaign {$id}: {$e->getMessage()}");
            return response()->json([
                'error' => 'queue_generation_failed',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    public function listQueue(Request $request, int $id): JsonResponse
    {
        $campaign = BulkEmailCampaign::where('user_id', $request->user()->id)->find($id);
        if (!$campaign) {
            return response()->json(['error' => 'not_found', 'message' => 'Campaign not found'], 404);
        }

        $perPage = min((int) $request->query('per_page', 20), 100);
        $status = $request->query('status');
        $query = $campaign->queueItems();

        if ($status) {
            $query->where('status', $status);
        }

        $items = $query->orderBy('created_at')->paginate($perPage);
        return response()->json([
            'items' => $items->items(),
            'total' => $items->total(),
            'current_page' => $items->currentPage(),
            'last_page' => $items->lastPage(),
            'per_page' => $items->perPage(),
        ]);
    }

    public function getStats(Request $request, int $id): JsonResponse
    {
        $campaign = BulkEmailCampaign::where('user_id', $request->user()->id)->find($id);
        if (!$campaign) {
            return response()->json(['error' => 'not_found', 'message' => 'Campaign not found'], 404);
        }

        $stats = $this->queueService->getStats($campaign);
        return response()->json([
            'campaign_id' => $campaign->id,
            'status' => $campaign->status,
            'stats' => array_merge($stats, [
                'progress_percent' => $campaign->progress_percent,
                'bounce_rate' => $campaign->bounce_rate,
                'complaint_rate' => $campaign->complaint_rate,
            ]),
        ]);
    }

    private function formatCampaign(BulkEmailCampaign $campaign): array
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
