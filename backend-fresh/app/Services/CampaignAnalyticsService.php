<?php

namespace App\Services;

use App\Models\BulkEmailCampaign;
use App\Models\BulkEmailQueueItem;
use App\Models\IPSendStats;

class CampaignAnalyticsService
{
    /**
     * Get comprehensive campaign analytics
     */
    public function getAnalytics(BulkEmailCampaign $campaign): array
    {
        return [
            'overview' => $this->getOverview($campaign),
            'delivery' => $this->getDeliveryMetrics($campaign),
            'accounts' => $this->getAccountMetrics($campaign),
            'timeline' => $this->getTimeline($campaign),
            'bounce_analysis' => $this->getBounceAnalysis($campaign),
        ];
    }

    /**
     * Get campaign overview
     */
    private function getOverview(BulkEmailCampaign $campaign): array
    {
        $total = $campaign->recipient_count ?? 0;
        $sent = $campaign->sent_count ?? 0;
        $failed = $campaign->failed_count ?? 0;
        $pending = max(0, $total - $sent - $failed);

        return [
            'total_recipients' => $total,
            'sent_count' => $sent,
            'failed_count' => $failed,
            'bounced_count' => $campaign->bounced_count ?? 0,
            'complaint_count' => $campaign->complaint_count ?? 0,
            'pending_count' => $pending,
            'progress_percent' => $total > 0 ? round(($sent + $failed) / $total * 100) : 0,
            'success_rate' => $sent > 0 ? round($sent / ($sent + $failed) * 100, 2) : 0,
            'bounce_rate' => $sent > 0 ? round(($campaign->bounced_count ?? 0) / $sent * 100, 2) : 0,
            'complaint_rate' => $sent > 0 ? round(($campaign->complaint_count ?? 0) / $sent * 100, 2) : 0,
        ];
    }

    /**
     * Get delivery metrics
     */
    private function getDeliveryMetrics(BulkEmailCampaign $campaign): array
    {
        $items = BulkEmailQueueItem::where('campaign_id', $campaign->id)->get();

        $statusBreakdown = $items->groupBy('status')->map->count()->toArray();
        $deliveryStatuses = $items->groupBy('delivery_status')->map->count()->toArray();

        // Calculate hourly delivery
        $hourlyData = [];
        for ($i = 0; $i < 24; $i++) {
            $start = now()->subHours(24 - $i)->startOfHour();
            $end = $start->copy()->endOfHour();

            $count = $items->whereBetween('sent_at', [$start, $end])->count();
            $hourlyData[] = [
                'hour' => $start->format('H:00'),
                'sent' => $count,
            ];
        }

        return [
            'status_breakdown' => $statusBreakdown,
            'delivery_status' => $deliveryStatuses,
            'hourly_trend' => $hourlyData,
            'avg_delivery_time' => $this->getAverageDeliveryTime($items),
        ];
    }

    /**
     * Get per-account metrics
     */
    private function getAccountMetrics(BulkEmailCampaign $campaign): array
    {
        $accounts = [];

        foreach ($campaign->account_ids ?? [] as $accountId) {
            $stats = IPSendStats::where('account_id', $accountId)
                ->where('date', today())
                ->first();

            $queueItems = BulkEmailQueueItem::where('campaign_id', $campaign->id)
                ->where('assigned_account_id', $accountId)
                ->get();

            $sent = $queueItems->where('status', 'sent')->count();
            $bounced = $queueItems->where('status', 'bounced')->count();

            $accounts[] = [
                'account_id' => $accountId,
                'emails_sent' => $sent,
                'bounces' => $bounced,
                'bounce_rate' => $sent > 0 ? round($bounced / $sent * 100, 2) : 0,
                'reputation_score' => $stats->reputation_score ?? 100,
                'status' => $stats->status ?? 'good',
            ];
        }

        return $accounts;
    }

    /**
     * Get event timeline
     */
    private function getTimeline(BulkEmailCampaign $campaign): array
    {
        $events = [];

        if ($campaign->created_at) {
            $events[] = [
                'time' => $campaign->created_at,
                'event' => 'Campaign created',
                'icon' => '📝',
            ];
        }

        if ($campaign->started_at) {
            $events[] = [
                'time' => $campaign->started_at,
                'event' => 'Campaign started',
                'icon' => '▶️',
            ];
        }

        if ($campaign->paused_at) {
            $events[] = [
                'time' => $campaign->paused_at,
                'event' => 'Campaign paused',
                'icon' => '⏸️',
            ];
        }

        if ($campaign->completed_at) {
            $events[] = [
                'time' => $campaign->completed_at,
                'event' => 'Campaign completed',
                'icon' => '✅',
            ];
        }

        return $events;
    }

    /**
     * Analyze bounce patterns
     */
    private function getBounceAnalysis(BulkEmailCampaign $campaign): array
    {
        $bounces = BulkEmailQueueItem::where('campaign_id', $campaign->id)
            ->where('status', 'bounced')
            ->get();

        $hardBounces = $bounces->where('bounce_type', 'hard')->count();
        $softBounces = $bounces->where('bounce_type', 'soft')->count();

        return [
            'total_bounces' => $bounces->count(),
            'hard_bounces' => $hardBounces,
            'soft_bounces' => $softBounces,
            'bounce_rate' => $campaign->sent_count > 0
                ? round($bounces->count() / $campaign->sent_count * 100, 2)
                : 0,
            'most_common_error' => $bounces->groupBy('error_code')
                ->map->count()
                ->sortDesc()
                ->keys()
                ->first(),
        ];
    }

    /**
     * Calculate average delivery time
     */
    private function getAverageDeliveryTime($items): float
    {
        $delivered = $items->whereNotNull('sent_at')->filter(fn($item) =>
            $item->delivery_status === 'delivered'
        );

        if ($delivered->isEmpty()) {
            return 0;
        }

        $totalTime = $delivered->sum(function ($item) {
            return $item->updated_at->diffInSeconds($item->sent_at);
        });

        return round($totalTime / $delivered->count());
    }

    /**
     * Export campaign data as CSV
     */
    public function exportAsCSV(BulkEmailCampaign $campaign): string
    {
        $items = BulkEmailQueueItem::where('campaign_id', $campaign->id)->get();

        $csv = "Email,Name,Group,Status,Bounce Type,Sent At,Delivered At,Error\n";

        foreach ($items as $item) {
            $csv .= implode(',', [
                $item->recipient_email,
                $item->recipient_name ?? '',
                $item->recipient_group ?? '',
                $item->status,
                $item->bounce_type ?? '',
                $item->sent_at?->toDateTimeString() ?? '',
                $item->updated_at->toDateTimeString(),
                $item->error_message ?? '',
            ]) . "\n";
        }

        return $csv;
    }
}
