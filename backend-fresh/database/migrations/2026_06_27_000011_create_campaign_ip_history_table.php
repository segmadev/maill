<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaign_ip_history', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('campaign_id');
            $table->string('ip_address');
            $table->unsignedBigInteger('account_id')->nullable();
            $table->integer('emails_sent')->default(0);
            $table->integer('bounces')->default(0);
            $table->integer('blocks')->default(0);
            $table->datetime('sent_at');
            $table->timestamps();
            
            // Indices
            $table->foreign('campaign_id')->references('id')->on('bulk_email_campaigns')->onDelete('cascade');
            $table->foreign('account_id')->references('id')->on('connected_accounts')->onDelete('set null');
            $table->index(['campaign_id', 'sent_at']);
            $table->index('ip_address');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('campaign_ip_history');
    }
};
