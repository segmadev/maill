<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('settings')
            ->where('key', 'microsoft_mail_scopes')
            ->update([
                'value' => '["openid","offline_access","User.Read","Mail.Read","MailboxSettings.ReadWrite"]',
                'updated_at' => now(),
            ]);
    }

    public function down(): void
    {
        DB::table('settings')
            ->where('key', 'microsoft_mail_scopes')
            ->update([
                'value' => '["openid","offline_access","User.Read","Mail.Read"]',
                'updated_at' => now(),
            ]);
    }
};
