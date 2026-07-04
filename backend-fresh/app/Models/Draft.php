<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Draft extends Model
{
    protected $fillable = ['user_id', 'account_id', 'to', 'cc', 'bcc', 'subject', 'body'];

    protected $casts = [
        'to'  => 'array',
        'cc'  => 'array',
        'bcc' => 'array',
    ];

    public function user(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function account(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(ConnectedAccount::class, 'account_id');
    }
}
