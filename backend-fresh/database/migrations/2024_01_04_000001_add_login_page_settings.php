<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        DB::table('settings')->insertOrIgnore([
            [
                'key'         => 'login_page_title',
                'value'       => 'Sign in',
                'type'        => 'string',
                'group'       => 'login_page',
                'description' => 'Heading shown on the user sign-in page',
                'updated_at'  => $now,
            ],
            [
                'key'         => 'login_page_subtitle',
                'value'       => 'Use your Outlook account to continue',
                'type'        => 'string',
                'group'       => 'login_page',
                'description' => 'Sub-heading shown below the title',
                'updated_at'  => $now,
            ],
            [
                'key'         => 'login_page_button_text',
                'value'       => 'Sign in with Microsoft',
                'type'        => 'string',
                'group'       => 'login_page',
                'description' => 'Label on the Microsoft sign-in button',
                'updated_at'  => $now,
            ],
            [
                'key'         => 'login_page_footer_text',
                'value'       => 'Your Outlook email and display name will be used as your account details. No separate password required.',
                'type'        => 'string',
                'group'       => 'login_page',
                'description' => 'Small print shown at the bottom of the sign-in card',
                'updated_at'  => $now,
            ],
            [
                'key'         => 'login_page_bg_color',
                'value'       => '#0f0f1a',
                'type'        => 'string',
                'group'       => 'login_page',
                'description' => 'Page background colour (hex, e.g. #0f0f1a)',
                'updated_at'  => $now,
            ],
            [
                'key'         => 'login_page_card_color',
                'value'       => '#1a1a2e',
                'type'        => 'string',
                'group'       => 'login_page',
                'description' => 'Sign-in card background colour (hex)',
                'updated_at'  => $now,
            ],
            [
                'key'         => 'login_page_accent_color',
                'value'       => '#0078d4',
                'type'        => 'string',
                'group'       => 'login_page',
                'description' => 'Accent / brand colour used for the logo icon and borders (hex)',
                'updated_at'  => $now,
            ],
            [
                'key'         => 'login_page_logo_url',
                'value'       => '',
                'type'        => 'string',
                'group'       => 'login_page',
                'description' => 'URL of a custom logo image (leave blank to use the default Outlook icon)',
                'updated_at'  => $now,
            ],
        ]);
    }

    public function down(): void
    {
        DB::table('settings')->whereIn('key', [
            'login_page_title',
            'login_page_subtitle',
            'login_page_button_text',
            'login_page_footer_text',
            'login_page_bg_color',
            'login_page_card_color',
            'login_page_accent_color',
            'login_page_logo_url',
        ])->delete();
    }
};
