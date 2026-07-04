<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('oauth_authorization_states', function (Blueprint $table) {
            // Add columns to store OAuth credentials with the state
            if (!Schema::hasColumn('oauth_authorization_states', 'client_id')) {
                $table->string('client_id')->nullable();
            }
            if (!Schema::hasColumn('oauth_authorization_states', 'client_secret')) {
                $table->string('client_secret')->nullable();
            }
            if (!Schema::hasColumn('oauth_authorization_states', 'tenant_id')) {
                $table->string('tenant_id')->nullable();
            }
            if (!Schema::hasColumn('oauth_authorization_states', 'email')) {
                $table->string('email')->nullable();
            }
            if (!Schema::hasColumn('oauth_authorization_states', 'user_id')) {
                $table->unsignedBigInteger('user_id')->nullable();
                // Add index at the same time as creating the column
                $table->index('user_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('oauth_authorization_states', function (Blueprint $table) {
            if (Schema::hasColumn('oauth_authorization_states', 'client_id')) {
                $table->dropColumn('client_id');
            }
            if (Schema::hasColumn('oauth_authorization_states', 'client_secret')) {
                $table->dropColumn('client_secret');
            }
            if (Schema::hasColumn('oauth_authorization_states', 'tenant_id')) {
                $table->dropColumn('tenant_id');
            }
            if (Schema::hasColumn('oauth_authorization_states', 'email')) {
                $table->dropColumn('email');
            }
            if (Schema::hasColumn('oauth_authorization_states', 'user_id')) {
                $table->dropColumn('user_id');
            }
        });
    }
};
