<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('oauth_authorization_states', function (Blueprint $table) {
            // Add code_verifier for PKCE support
            if (!Schema::hasColumn('oauth_authorization_states', 'code_verifier')) {
                $table->text('code_verifier')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('oauth_authorization_states', function (Blueprint $table) {
            if (Schema::hasColumn('oauth_authorization_states', 'code_verifier')) {
                $table->dropColumn('code_verifier');
            }
        });
    }
};
