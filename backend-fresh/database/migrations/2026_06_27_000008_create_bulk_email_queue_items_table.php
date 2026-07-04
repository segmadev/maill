<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bulk_email_queue_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('campaign_id');
            $table->string('recipient_email');
            $table->string('recipient_name')->nullable();
            $table->string('recipient_group')->nullable();  // For group-based reply-to override
            
            // Status tracking
            $table->enum('status', ['pending', 'sent', 'failed', 'bounced', 'retrying'])->default('pending');
            $table->enum('bounce_type', ['soft', 'hard', 'complaint', 'none'])->default('none')->nullable();
            
            // Account & delivery
            $table->unsignedBigInteger('assigned_account_id')->nullable();
            $table->string('assigned_account_ip')->nullable();
            $table->datetime('sent_at')->nullable();
            $table->string('delivery_status')->nullable();  // 'sent', 'failed', etc
            $table->integer('retry_count')->default(0);
            $table->datetime('last_retry_at')->nullable();
            
            // Error details
            $table->longText('error_message')->nullable();
            $table->string('error_code')->nullable();
            
            // Metadata
            $table->json('metadata')->nullable();  // Custom data per email
            $table->timestamps();
            
            // Indices
            $table->foreign('campaign_id')->references('id')->on('bulk_email_campaigns')->onDelete('cascade');
            $table->foreign('assigned_account_id')->references('id')->on('connected_accounts')->onDelete('set null');
            $table->index('status');
            $table->index(['campaign_id', 'status']);
            $table->index('recipient_email');
            $table->index('sent_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bulk_email_queue_items');
    }
};
