<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('connected_accounts', function (Blueprint $table) {
            // For manual OAuth: Encrypted client secret (for auto-renewal)
            $table->text('oauth_client_secret')->nullable()->after('oauth_client_id');

            // For manual OAuth: Tenant ID (for auto-renewal)
            $table->string('oauth_tenant_id')->nullable()->after('oauth_client_secret');
        });
    }

    public function down(): void
    {
        Schema::table('connected_accounts', function (Blueprint $table) {
            $table->dropColumn(['oauth_client_secret', 'oauth_tenant_id']);
        });
    }
};
