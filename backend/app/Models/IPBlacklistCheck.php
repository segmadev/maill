<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IPBlacklistCheck extends Model
{
    protected $table = 'ip_blacklist_checks';

    protected $fillable = [
        'ip_address',
        'is_blacklisted',
        'lists_flagged',
        'reputation_score',
        'check_time',
        'expires_at',
    ];

    protected $casts = [
        'lists_flagged' => 'json',
        'is_blacklisted' => 'boolean',
        'check_time' => 'datetime',
        'expires_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // Scopes
    public function scopeBlacklisted($query)
    {
        return $query->where('is_blacklisted', true);
    }

    public function scopeNotExpired($query)
    {
        return $query->where('expires_at', '>', now());
    }

    // Accessors
    public function getIsExpiredAttribute(): bool
    {
        return $this->expires_at === null || $this->expires_at->isPast();
    }

    public function getFlaggedListsCountAttribute(): int
    {
        return count($this->lists_flagged ?? []);
    }
}
