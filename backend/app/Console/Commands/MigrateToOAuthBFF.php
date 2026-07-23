<?php

namespace App\Console\Commands;

use App\Services\OAuthMigrationService;
use Illuminate\Console\Command;

class MigrateToOAuthBFF extends Command
{
    protected $signature = 'oauth:migrate-to-bff {--user-id= : Migrate specific user} {--dry-run : Show what would be migrated without making changes}';
    protected $description = 'Migrate users from JWT/manual OAuth to BFF OAuth sessions';

    public function handle(): int
    {
        $service = new OAuthMigrationService();
        $dryRun = $this->option('dry-run');
        $userId = $this->option('user-id');

        if ($dryRun) {
            $this->info('Running in dry-run mode - no changes will be made');
        }

        if ($userId) {
            return $this->migrateUser($service, $userId, $dryRun);
        }

        return $this->migrateAll($service, $dryRun);
    }

    private function migrateUser(OAuthMigrationService $service, int $userId, bool $dryRun): int
    {
        $user = \App\Models\User::find($userId);

        if (!$user) {
            $this->error("User not found: {$userId}");
            return 1;
        }

        $this->info("Migrating user: {$user->email}");

        if ($dryRun) {
            $this->info('(dry-run) Would migrate this user');
            return 0;
        }

        $session = $service->migrateJwtUserToBFF($user);

        if ($session) {
            $this->info("✓ Migrated successfully");
            $this->info("  Session ID: {$session->id}");
            $this->info("  Requires re-auth: " . ($session->requires_reauth ? 'Yes' : 'No'));
            return 0;
        }

        $this->error("✗ Migration failed");
        return 1;
    }

    private function migrateAll(OAuthMigrationService $service, bool $dryRun): int
    {
        $this->info("Starting bulk migration to BFF OAuth...");

        if ($dryRun) {
            $this->info('(dry-run) Would migrate all users with OAuth accounts');
            return 0;
        }

        $stats = $service->migrateAllUsers();

        $this->info("\n=== Migration Complete ===");
        $this->info("Total users: {$stats['total_users']}");
        $this->info("Migrated: {$stats['migrated']}");
        $this->info("Requires re-auth: {$stats['requires_reauth']}");
        $this->error("Failed: {$stats['failed']}");

        if (!empty($stats['errors'])) {
            $this->error("\nErrors:");
            foreach ($stats['errors'] as $error) {
                $this->error("  User {$error['user_id']}: {$error['error']}");
            }
        }

        return $stats['failed'] > 0 ? 1 : 0;
    }
}
