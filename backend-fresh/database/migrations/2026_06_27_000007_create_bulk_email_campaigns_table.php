<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bulk_email_campaigns', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('name');
            $table->enum('status', ['draft', 'scheduled', 'running', 'paused', 'completed', 'failed'])->default('draft');
            
            // Email content
            $table->string('subject');
            $table->longText('body');
            $table->longText('html_body')->nullable();
            
            // Statistics
            $table->integer('recipient_count')->default(0);
            $table->integer('sent_count')->default(0);
            $table->integer('failed_count')->default(0);
            $table->integer('bounced_count')->default(0);
            $table->integer('complaint_count')->default(0);
            
            // Configuration (JSON)
            $table->json('config')->nullable();  // rate_formula, delays, account_rotation_strategy, etc
            $table->json('reply_to_config')->nullable();  // Reply-to hierarchy config
            
            // Flags
            $table->boolean('importance_high')->default(false);
            $table->boolean('ip_rotation_strategy')->default(true);
            $table->integer('ip_daily_limit')->default(500);
            $table->integer('ip_hourly_limit')->default(50);
            $table->boolean('ip_warmup_enabled')->default(true);
            
            // Account selection
            $table->json('account_ids')->nullable();  // Array of selected account IDs
            
            // Timestamps
            $table->datetime('started_at')->nullable();
            $table->datetime('completed_at')->nullable();
            $table->datetime('paused_at')->nullable();
            $table->timestamps();
            
            // Indices
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->index('status');
            $table->index(['user_id', 'status']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bulk_email_campaigns');
    }
};
