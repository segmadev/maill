<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BulkEmailCampaign extends Model
{
    protected $fillable = [
        'user_id',
        'name',
        'status',
        'subject',
        'body',
        'html_body',
        'recipient_count',
        'sent_count',
        'failed_count',
        'bounced_count',
        'complaint_count',
        'config',
        'reply_to_config',
        'importance_high',
        'ip_rotation_strategy',
        'ip_daily_limit',
        'ip_hourly_limit',
        'ip_warmup_enabled',
        'account_ids',
        'recipient_distribution',
        'account_config',
        'started_at',
        'completed_at',
        'paused_at',
    ];

    protected $casts = [
        'config' => 'json',
        'reply_to_config' => 'json',
        'account_ids' => 'json',
        'account_config' => 'json',
        'importance_high' => 'boolean',
        'ip_warmup_enabled' => 'boolean',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'paused_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected $attributes = [
        'status' => 'draft',
        'recipient_distribution' => 'round-robin',
    ];

    // Relationships
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function queueItems(): HasMany
    {
        return $this->hasMany(BulkEmailQueueItem::class, 'campaign_id');
    }

    public function ipHistory(): HasMany
    {
        return $this->hasMany(CampaignIPHistory::class, 'campaign_id');
    }

    // Accessors
    public function getProgressPercentAttribute(): int
    {
        if ($this->recipient_count == 0) return 0;
        return (int) (($this->sent_count + $this->failed_count) / $this->recipient_count * 100);
    }

    public function getBounceRateAttribute(): float
    {
        if ($this->sent_count == 0) return 0;
        return ($this->bounced_count / $this->sent_count) * 100;
    }

    public function getComplaintRateAttribute(): float
    {
        if ($this->sent_count == 0) return 0;
        return ($this->complaint_count / $this->sent_count) * 100;
    }

    public function getIsRunningAttribute(): bool
    {
        return $this->status === 'running';
    }

    public function getIsPausedAttribute(): bool
    {
        return $this->status === 'paused';
    }
}
