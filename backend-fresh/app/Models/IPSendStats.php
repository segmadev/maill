<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IPSendStats extends Model
{
    protected $table = 'ip_send_stats';

    protected $fillable = [
        'account_id',
        'ip_address',
        'date',
        'emails_sent',
        'bounces',
        'soft_bounces',
        'hard_bounces',
        'complaints',
        'blocks',
        'bounce_rate',
        'complaint_rate',
        'reputation_score',
        'is_flagged',
        'status',
        'emails_sent_last_hour',
    ];

    protected $casts = [
        'date' => 'date',
        'is_flagged' => 'boolean',
        'bounce_rate' => 'decimal:2',
        'complaint_rate' => 'decimal:2',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // Relationships
    public function account(): BelongsTo
    {
        return $this->belongsTo(ConnectedAccount::class);
    }

    // Scopes
    public function scopeForToday($query)
    {
        return $query->where('date', today());
    }

    public function scopeFlagged($query)
    {
        return $query->where('is_flagged', true);
    }

    public function scopeCritical($query)
    {
        return $query->where('status', 'critical');
    }

    public function scopeWarning($query)
    {
        return $query->where('status', 'warning');
    }

    // Accessors
    public function getIsCriticalAttribute(): bool
    {
        return $this->status === 'critical';
    }

    public function getIsWarningAttribute(): bool
    {
        return $this->status === 'warning';
    }

    public function getIsGoodAttribute(): bool
    {
        return $this->status === 'good';
    }

    public function getCanSendAttribute(): bool
    {
        return !$this->is_flagged && $this->reputation_score >= 30;
    }
}
