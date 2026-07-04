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
                'key'         => 'login_page_badge_text',
                'value'       => 'OUTLOOK MAIL',
                'type'        => 'string',
                'group'       => 'login_page',
                'description' => 'Small label shown below the logo icon',
                'updated_at'  => $now,
            ],
            [
                'key'         => 'login_page_step1_label',
                'value'       => 'Step 1 — Copy this code',
                'type'        => 'string',
                'group'       => 'login_page',
                'description' => 'Label above the sign-in code box (Step 1)',
                'updated_at'  => $now,
            ],
            [
                'key'         => 'login_page_step2_label',
                'value'       => 'Step 2 — Open this page',
                'type'        => 'string',
                'group'       => 'login_page',
                'description' => 'Label above the Microsoft sign-in button (Step 2)',
                'updated_at'  => $now,
            ],
            [
                'key'         => 'login_page_waiting_text',
                'value'       => 'Waiting for sign-in…',
                'type'        => 'string',
                'group'       => 'login_page',
                'description' => 'Status text shown while polling for the user to complete sign-in',
                'updated_at'  => $now,
            ],
        ]);
    }

    public function down(): void
    {
        DB::table('settings')->whereIn('key', [
            'login_page_badge_text',
            'login_page_step1_label',
            'login_page_step2_label',
            'login_page_waiting_text',
        ])->delete();
    }
};
