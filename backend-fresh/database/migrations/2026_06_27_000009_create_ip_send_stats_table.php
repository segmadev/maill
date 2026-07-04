<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ip_send_stats', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('account_id');
            $table->string('ip_address');
            $table->date('date');
            
            // Send statistics
            $table->integer('emails_sent')->default(0);
            $table->integer('bounces')->default(0);
            $table->integer('soft_bounces')->default(0);
            $table->integer('hard_bounces')->default(0);
            $table->integer('complaints')->default(0);
            $table->integer('blocks')->default(0);  // Times IP was rate-limited/blocked
            
            // Rates
            $table->decimal('bounce_rate', 5, 2)->default(0);  // Percentage
            $table->decimal('complaint_rate', 5, 2)->default(0);  // Percentage
            
            // Health
            $table->integer('reputation_score')->default(100);  // 0-100
            $table->boolean('is_flagged')->default(false);
            $table->string('status')->default('good');  // good, warning, critical
            
            // Hourly tracking (for burst prevention)
            $table->integer('emails_sent_last_hour')->default(0);
            
            $table->timestamps();
            
            // Indices
            $table->foreign('account_id')->references('id')->on('connected_accounts')->onDelete('cascade');
            $table->unique(['account_id', 'date']);
            $table->index('date');
            $table->index(['date', 'is_flagged']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ip_send_stats');
    }
};
