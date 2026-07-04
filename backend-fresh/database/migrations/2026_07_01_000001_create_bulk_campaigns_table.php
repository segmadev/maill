<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bulk_campaigns', function (Blueprint $table) {
            $table->id();
            $table->string('name'); // Campaign name (from subject or user-given)
            $table->text('subject'); // Email subject
            $table->longText('body'); // Email body (HTML)
            $table->string('status')->default('draft'); // draft, queued, running, paused, completed, failed, cancelled
            $table->json('selected_accounts'); // Array of account IDs
            $table->json('recipients'); // Array of {email, data} objects
            $table->json('base64_fields')->nullable(); // Field names with base64-encoded data
            $table->json('campaign_settings'); // markAsImportant, emailsPerHour, dailyLimit, etc.

            // Progress tracking
            $table->integer('total_recipients')->default(0);
            $table->integer('processed_count')->default(0);
            $table->integer('sent_count')->default(0);
            $table->integer('failed_count')->default(0);

            // Timing
            $table->timestamps(); // Creates created_at and updated_at
            $table->timestamp('started_at')->nullable();
            $table->timestamp('paused_at')->nullable();
            $table->timestamp('completed_at')->nullable();

            // Batch tracking
            $table->json('batch_history')->nullable(); // Array of batch results
            $table->json('failed_recipients')->nullable(); // {email, reason}[]

            // User & account info
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('created_by')->nullable(); // Admin name

            $table->index('status');
            $table->index('created_at');
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bulk_campaigns');
    }
};
