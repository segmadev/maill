<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('connected_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('email');
            $table->string('display_name')->nullable();
            $table->string('avatar_url', 500)->nullable();
            // Tokens stored AES-256-CBC encrypted via TokenEncryptionService
            $table->text('access_token');
            $table->text('refresh_token');
            $table->dateTime('token_expires_at');
            $table->boolean('is_primary')->default(false);
            $table->timestamps();

            // A user cannot connect the same email account twice
            $table->unique(['user_id', 'email']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('connected_accounts');
    }
};
