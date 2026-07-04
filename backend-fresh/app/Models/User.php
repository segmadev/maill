<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class User extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'email', 'password', 'is_admin', 'is_active', 'last_login_at'];

    protected $hidden = ['password'];

    protected $casts = [
        'is_admin'      => 'boolean',
        'is_active'     => 'boolean',
        'last_login_at' => 'datetime',
        'created_at'    => 'datetime',
        'updated_at'    => 'datetime',
    ];

    public function connectedAccounts(): HasMany
    {
        return $this->hasMany(ConnectedAccount::class);
    }
}
