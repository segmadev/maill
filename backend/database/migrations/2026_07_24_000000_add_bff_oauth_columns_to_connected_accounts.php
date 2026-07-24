<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('connected_accounts', function (Blueprint $table) {
            // Token refresh tracking - add only if they don't exist
            if (!Schema::hasColumn('connected_accounts', 'last_token_refresh')) {
                $table->timestamp('last_token_refresh')->nullable()->after('token_expires_at');
            }

            // Note: refresh_token_expires_at may already exist from earlier migrations
            if (!Schema::hasColumn('connected_accounts', 'refresh_token_expires_at')) {
                $table->timestamp('refresh_token_expires_at')->nullable()->after('token_expires_at');
            }

            // Re-auth flag: when true, user needs to re-authenticate (token/refresh expired)
            if (!Schema::hasColumn('connected_accounts', 'requires_reauth')) {
                $table->boolean('requires_reauth')->default(false);
            }

            // Token refresh failure tracking
            if (!Schema::hasColumn('connected_accounts', 'refresh_failed_count')) {
                $table->integer('refresh_failed_count')->default(0);
            }

            if (!Schema::hasColumn('connected_accounts', 'last_refresh_error')) {
                $table->text('last_refresh_error')->nullable();
            }

            // For OAuth accounts: store encrypted client secret for re-auth
            if (!Schema::hasColumn('connected_accounts', 'encrypted_oauth_secret')) {
                $table->text('encrypted_oauth_secret')->nullable();
            }

            // Tenant ID for multi-tenant OAuth (personal vs business accounts)
            if (!Schema::hasColumn('connected_accounts', 'tenant_id')) {
                $table->string('tenant_id')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('connected_accounts', function (Blueprint $table) {
            $table->dropColumn([
                'last_token_refresh',
                'refresh_token_expires_at',
                'requires_reauth',
                'refresh_failed_count',
                'last_refresh_error',
                'encrypted_oauth_secret',
                'tenant_id',
            ]);
        });
    }
};
