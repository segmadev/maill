<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CampaignIPHistory extends Model
{
    protected $table = 'campaign_ip_history';

    protected $fillable = [
        'campaign_id',
        'ip_address',
        'account_id',
        'emails_sent',
        'bounces',
        'blocks',
        'sent_at',
    ];

    protected $casts = [
        'sent_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // Relationships
    public function campaign(): BelongsTo
    {
        return $this->belongsTo(BulkEmailCampaign::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(ConnectedAccount::class);
    }

    // Accessors
    public function getBounceRateAttribute(): float
    {
        if ($this->emails_sent == 0) return 0;
        return ($this->bounces / $this->emails_sent) * 100;
    }
}
