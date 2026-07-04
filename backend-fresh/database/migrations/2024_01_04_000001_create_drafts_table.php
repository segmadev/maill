<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('drafts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('account_id')->nullable();   // which account to send from
            $table->json('to')->default('[]');
            $table->json('cc')->default('[]');
            $table->json('bcc')->default('[]');
            $table->string('subject', 1000)->default('');
            $table->longText('body')->default('');
            $table->timestamps();

            $table->foreign('user_id')
                  ->references('id')->on('users')
                  ->onDelete('cascade');

            $table->foreign('account_id')
                  ->references('id')->on('connected_accounts')
                  ->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('drafts');
    }
};
