<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BulkEmailQueueItem extends Model
{
    protected $fillable = [
        'campaign_id',
        'recipient_email',
        'recipient_name',
        'recipient_group',
        'status',
        'bounce_type',
        'assigned_account_id',
        'assigned_account_ip',
        'sent_at',
        'delivery_status',
        'retry_count',
        'last_retry_at',
        'error_message',
        'error_code',
        'metadata',
    ];

    protected $casts = [
        'metadata' => 'json',
        'sent_at' => 'datetime',
        'last_retry_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // Relationships
    public function campaign(): BelongsTo
    {
        return $this->belongsTo(BulkEmailCampaign::class, 'campaign_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(ConnectedAccount::class, 'assigned_account_id');
    }

    // Scopes
    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeSent($query)
    {
        return $query->where('status', 'sent');
    }

    public function scopeFailed($query)
    {
        return $query->where('status', 'failed');
    }

    public function scopeBounced($query)
    {
        return $query->where('status', 'bounced');
    }

    public function scopeRetrying($query)
    {
        return $query->where('status', 'retrying');
    }

    // Accessors
    public function getIsSentAttribute(): bool
    {
        return $this->status === 'sent';
    }

    public function getIsFailedAttribute(): bool
    {
        return $this->status === 'failed';
    }

    public function getIsBouncedAttribute(): bool
    {
        return $this->status === 'bounced';
    }

    public function getCanRetryAttribute(): bool
    {
        return in_array($this->status, ['failed', 'retrying']) && $this->retry_count < 3;
    }
}
