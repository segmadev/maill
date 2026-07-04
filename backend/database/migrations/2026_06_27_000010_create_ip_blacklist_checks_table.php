<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ip_blacklist_checks', function (Blueprint $table) {
            $table->id();
            $table->string('ip_address')->unique();
            $table->boolean('is_blacklisted')->default(false);
            $table->json('lists_flagged')->nullable();  // ['spamhaus', 'barracuda', etc]
            $table->integer('reputation_score')->default(100);  // 0-100
            $table->datetime('check_time')->nullable();
            $table->datetime('expires_at')->nullable();  // When this cache entry expires
            $table->timestamps();
            
            // Indices
            $table->index('ip_address');
            $table->index('is_blacklisted');
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ip_blacklist_checks');
    }
};
