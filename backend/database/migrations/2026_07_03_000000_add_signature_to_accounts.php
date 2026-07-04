<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('connected_accounts', function (Blueprint $table) {
            // Store cached signature (plain text or HTML)
            if (!Schema::hasColumn('connected_accounts', 'signature')) {
                $table->longText('signature')->nullable();
            }

            // Track when signature was last fetched
            if (!Schema::hasColumn('connected_accounts', 'signature_updated_at')) {
                $table->timestamp('signature_updated_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('connected_accounts', function (Blueprint $table) {
            if (Schema::hasColumn('connected_accounts', 'signature')) {
                $table->dropColumn('signature');
            }
            if (Schema::hasColumn('connected_accounts', 'signature_updated_at')) {
                $table->dropColumn('signature_updated_at');
            }
        });
    }
};
