<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('oauth_authorization_states', function (Blueprint $table) {
            $table->id();
            $table->string('state')->unique()->index();
            $table->json('scopes')->nullable();
            $table->dateTime('expires_at')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('oauth_authorization_states');
    }
};
