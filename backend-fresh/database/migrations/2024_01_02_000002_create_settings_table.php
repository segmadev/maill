<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->text('value')->nullable();
            $table->enum('type', ['string', 'boolean', 'integer', 'json'])->default('string');
            $table->string('description', 500)->nullable();
            $table->string('group', 100)->default('general');
            $table->timestamp('updated_at')->nullable();
        });

        // Seed default settings
        $now = now();
        DB::table('settings')->insert([
            ['key' => 'app_name',                  'value' => 'Mail Manager',  'type' => 'string',  'group' => 'general',  'description' => 'Application display name',                            'updated_at' => $now],
            ['key' => 'allow_registration',        'value' => '1',             'type' => 'boolean', 'group' => 'general',  'description' => 'Allow new users to self-register',                    'updated_at' => $now],
            ['key' => 'maintenance_mode',          'value' => '0',             'type' => 'boolean', 'group' => 'general',  'description' => 'Put the app into maintenance mode (blocks all logins)', 'updated_at' => $now],
            ['key' => 'max_accounts_per_user',     'value' => '10',            'type' => 'integer', 'group' => 'accounts', 'description' => 'Maximum connected email accounts per user',            'updated_at' => $now],
            ['key' => 'allowed_email_domains',     'value' => '',              'type' => 'string',  'group' => 'accounts', 'description' => 'Comma-separated list of allowed Microsoft domains (empty = all)', 'updated_at' => $now],
            ['key' => 'emails_per_sync',           'value' => '50',            'type' => 'integer', 'group' => 'sync',     'description' => 'Number of emails to fetch per folder sync',           'updated_at' => $now],
            ['key' => 'cache_email_bodies',        'value' => '1',             'type' => 'boolean', 'group' => 'sync',     'description' => 'Cache full email HTML bodies to JSON files',          'updated_at' => $now],
            ['key' => 'jwt_ttl_minutes',           'value' => '1440',          'type' => 'integer', 'group' => 'security', 'description' => 'JWT token lifetime in minutes (default: 1440 = 24h)', 'updated_at' => $now],
            ['key' => 'require_email_verification','value' => '0',             'type' => 'boolean', 'group' => 'security', 'description' => 'Require email verification before login',             'updated_at' => $now],
            ['key' => 'admin_email',               'value' => '',              'type' => 'string',  'group' => 'general',  'description' => 'Admin contact email shown in error pages',            'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};
