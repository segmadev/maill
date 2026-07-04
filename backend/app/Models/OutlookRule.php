<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OutlookRule extends Model
{
    protected $fillable = [
        'account_id',
        'outlook_rule_id',
        'display_name',
        'description',
        'conditions',
        'actions',
        'is_enabled',
        'sequence',
    ];

    protected $casts = [
        'conditions' => 'array',
        'actions' => 'array',
        'is_enabled' => 'boolean',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(ConnectedAccount::class);
    }

    /**
     * Convert local rule format to Microsoft Graph format
     */
    public function toGraphFormat(): array
    {
        return [
            'displayName' => $this->display_name,
            'sequence' => $this->sequence,
            'isEnabled' => $this->is_enabled,
            'conditions' => $this->conditions,
            'actions' => $this->actions,
        ];
    }

    /**
     * Create from Microsoft Graph response
     */
    public static function fromGraphResponse(array $graphRule, int $accountId): self
    {
        return new self([
            'account_id' => $accountId,
            'outlook_rule_id' => $graphRule['id'] ?? null,
            'display_name' => $graphRule['displayName'] ?? '',
            'conditions' => $graphRule['conditions'] ?? [],
            'actions' => $graphRule['actions'] ?? [],
            'is_enabled' => $graphRule['isEnabled'] ?? true,
            'sequence' => $graphRule['sequence'] ?? 1,
        ]);
    }
}
