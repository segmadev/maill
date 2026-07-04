<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Track bounced emails
        Schema::create('email_bounces', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('account_id');
            $table->string('email');
            $table->enum('bounce_type', ['hard', 'soft'])->default('soft');
            $table->text('reason')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index('account_id');
            $table->index('email');
            $table->index('created_at');
            $table->unique(['account_id', 'email', 'bounce_type'], 'unique_bounce_per_account_email');
        });

        // Track spam complaints
        Schema::create('email_complaints', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('account_id');
            $table->string('email');
            $table->string('complaint_source')->default('user'); // user, isp, etc
            $table->timestamp('created_at')->nullable();

            $table->index('account_id');
            $table->index('email');
            $table->index('created_at');
        });

        // Suppression list (addresses that shouldn't be emailed)
        Schema::create('email_suppressions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('account_id');
            $table->string('email');
            $table->string('reason'); // hard_bounce, complaint, unsubscribe, etc
            $table->enum('status', ['active', 'removed'])->default('active');
            $table->timestamp('created_at')->nullable();
            $table->timestamp('removed_at')->nullable();

            $table->index('account_id');
            $table->index('email');
            $table->index('status');
            $table->unique(['account_id', 'email'], 'unique_suppression_per_account');
        });

        // Track email health metrics
        Schema::create('email_health_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('account_id');
            $table->string('recipient_email');
            $table->enum('event_type', ['sent', 'opened', 'clicked', 'bounced', 'complained']);
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index('account_id');
            $table->index('recipient_email');
            $table->index('event_type');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_bounces');
        Schema::dropIfExists('email_complaints');
        Schema::dropIfExists('email_suppressions');
        Schema::dropIfExists('email_health_logs');
    }
};
