<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Add compliance settings if they don't exist
        $existing = DB::table('settings')
            ->whereIn('key', [
                'email_unsubscribe_link',
                'email_physical_address',
                'email_unsubscribe_text',
            ])
            ->pluck('key')
            ->toArray();

        $settings = [
            [
                'key' => 'email_unsubscribe_link',
                'group' => 'email',
                'description' => 'Unsubscribe Link URL (CAN-SPAM). Example: https://yoursite.com/unsubscribe',
                'type' => 'text',
                'value' => '',
                'updated_at' => now(),
            ],
            [
                'key' => 'email_unsubscribe_text',
                'group' => 'email',
                'description' => 'Text to display for unsubscribe link in email footer',
                'type' => 'text',
                'value' => 'Unsubscribe',
                'updated_at' => now(),
            ],
            [
                'key' => 'email_physical_address',
                'group' => 'email',
                'description' => 'Physical business mailing address (CAN-SPAM compliance)',
                'type' => 'textarea',
                'value' => '',
                'updated_at' => now(),
            ],
        ];

        foreach ($settings as $setting) {
            if (!in_array($setting['key'], $existing)) {
                DB::table('settings')->insert($setting);
            }
        }
    }

    public function down(): void
    {
        DB::table('settings')
            ->whereIn('key', [
                'email_unsubscribe_link',
                'email_physical_address',
                'email_unsubscribe_text',
            ])
            ->delete();
    }
};
