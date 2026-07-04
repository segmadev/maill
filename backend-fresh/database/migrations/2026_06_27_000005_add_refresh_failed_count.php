<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('connected_accounts', function (Blueprint $table) {
            $table->integer('refresh_failed_count')->default(0)->after('refresh_token_expires_at');
            $table->datetime('last_refresh_attempt_at')->nullable()->after('refresh_failed_count');
        });
    }

    public function down(): void
    {
        Schema::table('connected_accounts', function (Blueprint $table) {
            $table->dropColumn(['refresh_failed_count', 'last_refresh_attempt_at']);
        });
    }
};
