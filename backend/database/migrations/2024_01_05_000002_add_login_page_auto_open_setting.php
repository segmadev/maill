<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('settings')->insertOrIgnore([
            [
                'key'         => 'login_page_auto_open_link',
                'value'       => '1',
                'type'        => 'boolean',
                'group'       => 'login_page',
                'description' => 'Automatically open the Microsoft sign-in page in a new tab when the user copies the code',
                'updated_at'  => now(),
            ],
        ]);
    }

    public function down(): void
    {
        DB::table('settings')->where('key', 'login_page_auto_open_link')->delete();
    }
};
