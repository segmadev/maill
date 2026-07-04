<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Signature Templates (pre-made by admin)
        Schema::create('signature_templates', function (Blueprint $table) {
            $table->id();
            $table->string('name'); // "Professional", "Modern", "Corporate", etc.
            $table->text('description')->nullable();
            $table->longText('html_template'); // Template with {{variable}} placeholders
            $table->json('variables')->default('[]'); // List of available variables
            $table->string('preview_image')->nullable(); // URL to preview image
            $table->timestamps();
        });

        // Custom Email Signatures (created from templates by admin)
        Schema::create('email_signatures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('template_id')->nullable()->constrained('signature_templates')->nullOnDelete();
            $table->string('name'); // e.g., "Sales Team Signature"
            $table->string('description')->nullable();
            $table->longText('html_content'); // Customized HTML
            $table->json('variables_data')->default('{}'); // Resolved variables
            $table->foreignId('created_by')->constrained('users'); // Admin who created it
            $table->timestamps();
        });

        // Link signatures to accounts (many-to-many with pivot data)
        Schema::create('account_signatures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->constrained('connected_accounts')->cascadeOnDelete();
            $table->foreignId('signature_id')->constrained('email_signatures')->cascadeOnDelete();
            $table->boolean('is_default')->default(false); // Default signature for account
            $table->timestamps();

            // Prevent duplicate assignments
            $table->unique(['account_id', 'signature_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_signatures');
        Schema::dropIfExists('email_signatures');
        Schema::dropIfExists('signature_templates');
    }
};
