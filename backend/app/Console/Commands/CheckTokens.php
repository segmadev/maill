<?php

namespace App\Console\Commands;

use App\Models\ConnectedAccount;
use App\Services\TokenEncryptionService;
use Illuminate\Console\Command;

class CheckTokens extends Command
{
    protected $signature = 'debug:check-tokens';
    protected $description = 'Validate stored OAuth tokens and check for corruption';

    public function handle(TokenEncryptionService $encryption)
    {
        $accounts = ConnectedAccount::whereNotNull('access_token')->get();

        if ($accounts->isEmpty()) {
            $this->info('No accounts with access tokens found.');
            return;
        }

        $this->info("Checking " . $accounts->count() . " accounts...\n");

        foreach ($accounts as $account) {
            $this->line("Account: {$account->email} (ID: {$account->id})");

            try {
                $decrypted = $encryption->decrypt($account->access_token);
                $isValid = !empty($decrypted) && str_contains($decrypted, '.');
                $tokenLength = strlen($decrypted);
                $tokenPreview = substr($decrypted, 0, 50) . (strlen($decrypted) > 50 ? '...' : '');

                $status = $isValid ? '<fg=green>✓ VALID</>' : '<fg=red>✗ INVALID</>';
                $this->line("  Status: {$status}");
                $this->line("  Length: {$tokenLength}");
                $this->line("  Preview: {$tokenPreview}");
                $this->line("  Has dots: " . (str_contains($decrypted, '.') ? 'yes' : 'no'));

                // Count dots for debugging
                $dotCount = substr_count($decrypted, '.');
                $this->line("  Dot count: {$dotCount} (JWT should have 2)");

            } catch (\Exception $e) {
                $this->line("  <fg=red>ERROR:</> {$e->getMessage()}");
            }

            $this->newLine();
        }
    }
}
