<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SignatureTemplate extends Model
{
    protected $fillable = [
        'name',
        'description',
        'html_template',
        'variables',
        'preview_image',
    ];

    protected $casts = [
        'variables' => 'array',
    ];

    public function signatures()
    {
        return $this->hasMany(EmailSignature::class, 'template_id');
    }
}
