<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OAuthAuthorizationState extends Model
{
    protected $table = 'oauth_authorization_states';

    protected $fillable = [
        'state',
        'scopes',
        'expires_at',
        'user_id',
        'client_id',
        'client_secret',
        'tenant_id',
        'email',
        'code_verifier',
    ];

    protected $casts = [
        'scopes' => 'array',
        'expires_at' => 'datetime',
    ];

    public $timestamps = false;
}
