<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('bulk_email_campaigns', function (Blueprint $table) {
            $table->string('recipient_distribution')->default('round-robin')->after('account_ids');
            $table->json('account_config')->nullable()->after('recipient_distribution');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bulk_email_campaigns', function (Blueprint $table) {
            $table->dropColumn(['recipient_distribution', 'account_config']);
        });
    }
};
