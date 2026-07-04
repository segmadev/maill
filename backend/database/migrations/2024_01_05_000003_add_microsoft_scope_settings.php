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
                'key'         => 'microsoft_login_scopes',
                'value'       => '["openid","offline_access","User.Read"]',
                'type'        => 'json',
                'group'       => 'azure',
                'description' => 'Scopes requested during user sign-in. Keep minimal — these should never require admin consent.',
                'updated_at'  => $now,
            ],
            [
                'key'         => 'microsoft_mail_scopes',
                'value'       => '["openid","offline_access","User.Read","Mail.Read"]',
                'type'        => 'json',
                'group'       => 'azure',
                'description' => 'Scopes requested when connecting a mailbox or upgrading mail access. May require admin consent on organisational tenants.',
                'updated_at'  => $now,
            ],
        ]);
    }

    public function down(): void
    {
        DB::table('settings')
            ->whereIn('key', ['microsoft_login_scopes', 'microsoft_mail_scopes'])
            ->delete();
    }
};
