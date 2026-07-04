<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Make emails.folder_id nullable so Graph KQL search results can be cached
     * even when the parent folder has not yet been synced to email_folders.
     */
    public function up(): void
    {
        Schema::table('emails', function (Blueprint $table) {
            // Drop the old NOT NULL foreign key column and re-add it as nullable.
            // Laravel handles the SQLite table rewrite automatically via ->change().
            $table->unsignedBigInteger('folder_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('emails', function (Blueprint $table) {
            $table->unsignedBigInteger('folder_id')->nullable(false)->change();
        });
    }
};
