<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Email extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'account_id',
        'folder_id',
        'graph_message_id',
        'subject',
        'sender_name',
        'sender_email',
        'received_at',
        'is_read',
        'has_attachments',
        'importance',
        'body_preview',
        'synced_at',
        'created_at',
    ];

    protected $casts = [
        'received_at'    => 'datetime',
        'synced_at'      => 'datetime',
        'created_at'     => 'datetime',
        'is_read'        => 'boolean',
        'has_attachments'=> 'boolean',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(ConnectedAccount::class, 'account_id');
    }

    public function folder(): BelongsTo
    {
        return $this->belongsTo(EmailFolder::class, 'folder_id');
    }
}
