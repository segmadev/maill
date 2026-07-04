<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Account alerts table
        Schema::create('account_alerts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('account_id');
            $table->string('type'); // bounce_critical, complaint_warning, etc.
            $table->text('message');
            $table->enum('severity', ['info', 'warning', 'critical'])->default('warning');
            $table->json('metadata')->nullable();
            $table->enum('status', ['active', 'resolved', 'dismissed'])->default('active');
            $table->timestamp('created_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('dismissed_at')->nullable();

            $table->index('account_id');
            $table->index('status');
            $table->index('severity');
            $table->index('type');
            $table->index('created_at');
        });

        // Alert notification preferences (per account)
        Schema::create('alert_preferences', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('account_id');
            $table->boolean('email_alerts')->default(true);
            $table->boolean('slack_alerts')->default(false);
            $table->boolean('critical_only')->default(false);
            $table->string('slack_webhook')->nullable();
            $table->string('alert_email')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();

            $table->unique('account_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_alerts');
        Schema::dropIfExists('alert_preferences');
    }
};
