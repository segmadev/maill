<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EmailFolder extends Model
{
    protected $fillable = [
        'account_id',
        'graph_folder_id',
        'display_name',
        'parent_folder_id',
        'total_items',
        'unread_items',
        'synced_at',
    ];

    protected $casts = [
        'synced_at'   => 'datetime',
        'total_items' => 'integer',
        'unread_items'=> 'integer',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(ConnectedAccount::class, 'account_id');
    }

    public function emails(): HasMany
    {
        return $this->hasMany(Email::class, 'folder_id');
    }
}
