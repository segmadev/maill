<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('connected_accounts', function (Blueprint $table) {
            // When refresh token expires (Microsoft expires after ~90 days)
            $table->timestamp('refresh_token_expires_at')->nullable()->after('token_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('connected_accounts', function (Blueprint $table) {
            $table->dropColumn('refresh_token_expires_at');
        });
    }
};
