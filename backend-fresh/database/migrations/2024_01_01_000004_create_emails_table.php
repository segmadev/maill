<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('emails', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->constrained('connected_accounts')->cascadeOnDelete();
            $table->foreignId('folder_id')->constrained('email_folders')->cascadeOnDelete();
            // Graph message IDs are long opaque strings
            $table->string('graph_message_id', 500)->unique();
            $table->string('subject', 1000)->nullable();
            $table->string('sender_name')->nullable();
            $table->string('sender_email')->nullable();
            $table->dateTime('received_at')->nullable();
            $table->boolean('is_read')->default(false);
            $table->boolean('has_attachments')->default(false);
            $table->enum('importance', ['low', 'normal', 'high'])->default('normal');
            // Short preview stored in DB; full body lives in JSON file cache
            $table->string('body_preview', 500)->nullable();
            $table->timestamp('synced_at')->useCurrent();
            // No updated_at — we replace rows on re-sync, not update them
            $table->timestamp('created_at')->useCurrent();

            $table->index(['account_id', 'folder_id', 'received_at']);
            $table->index(['account_id', 'is_read']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('emails');
    }
};
