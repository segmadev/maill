<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bulk_campaigns', function (Blueprint $table) {
            // Store recipient tracking: {email, account_id, status, reason}
            $table->json('recipient_tracking')->nullable()->after('failed_recipients');
        });
    }

    public function down(): void
    {
        Schema::table('bulk_campaigns', function (Blueprint $table) {
            $table->dropColumn('recipient_tracking');
        });
    }
};
