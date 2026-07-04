<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_folders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->constrained('connected_accounts')->cascadeOnDelete();
            $table->string('graph_folder_id');          // Graph API folder ID (opaque string)
            $table->string('display_name');
            $table->string('parent_folder_id')->nullable();  // Graph ID of parent, null for top-level
            $table->unsignedInteger('total_items')->default(0);
            $table->unsignedInteger('unread_items')->default(0);
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();

            $table->unique(['account_id', 'graph_folder_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_folders');
    }
};
