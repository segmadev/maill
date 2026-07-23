<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('oauth_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('account_id')->nullable()->constrained('connected_accounts')->onDelete('cascade');

            // Microsoft OAuth tokens (encrypted)
            $table->longText('microsoft_access_token')->nullable();
            $table->longText('microsoft_refresh_token')->nullable();
            $table->timestamp('token_expires_at')->nullable();
            $table->timestamp('refresh_token_expires_at')->nullable();

            // Account information
            $table->string('account_type')->nullable(); // personal, business
            $table->string('tenant_id')->nullable();
            $table->string('microsoft_email')->nullable();
            $table->string('microsoft_user_id')->nullable();

            // Token refresh tracking
            $table->timestamp('last_refreshed_at')->nullable();
            $table->integer('refresh_failed_count')->default(0);
            $table->text('last_refresh_error')->nullable();
            $table->boolean('requires_reauth')->default(false);

            // OAuth flow state
            $table->string('pkce_code_challenge')->nullable();
            $table->string('oauth_state')->nullable();
            $table->timestamp('state_expires_at')->nullable();

            // Session management
            $table->string('session_token')->unique();
            $table->timestamp('session_expires_at')->nullable();
            $table->timestamp('last_activity_at')->nullable();

            $table->timestamps();

            $table->index(['user_id', 'session_expires_at']);
            $table->index(['requires_reauth']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('oauth_sessions');
    }
};
