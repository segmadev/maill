<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class EmailSignature extends Model
{
    protected $fillable = [
        'template_id',
        'name',
        'description',
        'html_content',
        'variables_data',
        'created_by',
    ];

    protected $casts = [
        'variables_data' => 'array',
    ];

    public function template()
    {
        return $this->belongsTo(SignatureTemplate::class, 'template_id');
    }

    public function accounts(): BelongsToMany
    {
        return $this->belongsToMany(ConnectedAccount::class, 'account_signatures', 'signature_id', 'account_id')
            ->withPivot('is_default')
            ->withTimestamps();
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Render signature by replacing variables with actual values
     */
    public function render(array $variables = []): string
    {
        $html = $this->html_content;

        foreach ($variables as $key => $value) {
            $html = str_replace('{{' . $key . '}}', $value, $html);
        }

        return $html;
    }
}
