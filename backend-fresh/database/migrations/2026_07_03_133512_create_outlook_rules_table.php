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
        Schema::create('outlook_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->constrained('connected_accounts')->cascadeOnDelete();
            $table->string('outlook_rule_id')->nullable()->unique(); // ID from Microsoft Graph
            $table->string('display_name');
            $table->text('description')->nullable();
            $table->json('conditions'); // Stores condition objects
            $table->json('actions'); // Stores action objects
            $table->boolean('is_enabled')->default(true);
            $table->integer('sequence')->default(1);
            $table->timestamps();

            $table->index(['account_id', 'is_enabled']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('outlook_rules');
    }
};
