<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add columns to connected_accounts for token renewal tracking
        Schema::table('connected_accounts', function (Blueprint $table) {
            $table->datetime('last_token_refresh_at')->nullable()->after('token_expires_at');
            $table->boolean('requires_reauthentication')->default(false)->after('last_token_refresh_at');
        });

        // Create system_status table for cron job progress tracking
        Schema::create('system_status', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->json('value')->nullable();
            $table->text('description')->nullable();
            $table->timestamps();
            $table->index('key');
        });
    }

    public function down(): void
    {
        Schema::table('connected_accounts', function (Blueprint $table) {
            $table->dropColumn(['last_token_refresh_at', 'requires_reauthentication']);
        });

        Schema::dropIfExists('system_status');
    }
};
