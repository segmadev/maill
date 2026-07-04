<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        DB::table('settings')->insertOrIgnore([
            ['key' => 'azure_client_id',     'value' => '', 'type' => 'string', 'group' => 'azure', 'description' => 'Application (client) ID from your Azure App Registration',              'updated_at' => $now],
            ['key' => 'azure_client_secret', 'value' => '', 'type' => 'string', 'group' => 'azure', 'description' => 'Client secret value (not the secret ID) — keep this private',           'updated_at' => $now],
            ['key' => 'azure_tenant_id',     'value' => 'common', 'type' => 'string', 'group' => 'azure', 'description' => 'Directory (tenant) ID, or "common" for personal + work accounts', 'updated_at' => $now],
            ['key' => 'azure_redirect_uri',  'value' => '', 'type' => 'string', 'group' => 'azure', 'description' => 'Must match exactly what is registered in Azure (e.g. http://127.0.0.1:8765/api/auth/microsoft/callback)', 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        DB::table('settings')->whereIn('key', [
            'azure_client_id',
            'azure_client_secret',
            'azure_tenant_id',
            'azure_redirect_uri',
        ])->delete();
    }
};
