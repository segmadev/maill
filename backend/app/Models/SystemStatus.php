<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SystemStatus extends Model
{
    protected $fillable = ['key', 'value', 'description'];

    protected $casts = [
        'value' => 'json',
    ];

    protected $table = 'system_status';

    public $timestamps = true;
}
