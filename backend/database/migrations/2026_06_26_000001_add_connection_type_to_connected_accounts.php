<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('connected_accounts', function (Blueprint $table) {
            // Connection method: 'oauth' (user-initiated), 'oauth_manual' (admin-added with client ID/secret), 'smtp'
            $table->string('connection_type')->default('oauth')->after('is_primary');

            // For SMTP connections: encrypted JSON with host, port, username, password
            $table->text('smtp_credentials')->nullable()->after('connection_type');

            // Priority order for fallback (1 = primary, 2 = secondary, etc.)
            // NULL means auto-determined
            $table->integer('priority')->nullable()->after('smtp_credentials');

            // For manual OAuth: Client ID used (for admin reference/audit)
            $table->string('oauth_client_id')->nullable()->after('priority');
        });
    }

    public function down(): void
    {
        Schema::table('connected_accounts', function (Blueprint $table) {
            $table->dropColumn(['connection_type', 'smtp_credentials', 'priority', 'oauth_client_id']);
        });
    }
};
