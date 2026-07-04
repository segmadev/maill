<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BulkCampaign extends Model
{
    protected $fillable = [
        'name',
        'subject',
        'body',
        'status',
        'selected_accounts',
        'recipients',
        'base64_fields',
        'campaign_settings',
        'total_recipients',
        'processed_count',
        'sent_count',
        'failed_count',
        'started_at',
        'paused_at',
        'completed_at',
        'batch_history',
        'failed_recipients',
        'user_id',
        'created_by',
    ];

    protected $casts = [
        'selected_accounts' => 'array',
        'recipients' => 'array',
        'base64_fields' => 'array',
        'campaign_settings' => 'array',
        'batch_history' => 'array',
        'failed_recipients' => 'array',
        'started_at' => 'datetime',
        'paused_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function getProgressPercentageAttribute()
    {
        if ($this->total_recipients === 0) return 0;
        return round(($this->processed_count / $this->total_recipients) * 100);
    }

    public function getDurationAttribute()
    {
        if (!$this->started_at) return null;
        $end = $this->completed_at ?? now();
        return $end->diffInSeconds($this->started_at);
    }

    public function getElapsedTimeAttribute()
    {
        if (!$this->started_at) return null;
        return now()->diffInSeconds($this->started_at);
    }
}
