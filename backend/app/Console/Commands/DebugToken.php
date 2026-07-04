<?php

namespace App\Console\Commands;

use App\Models\ConnectedAccount;
use App\Services\TokenEncryptionService;
use Illuminate\Console\Command;

class DebugToken extends Command
{
    protected $signature = 'debug:token {id}';
    protected $description = 'Debug a specific token';

    public function handle(TokenEncryptionService $encryption)
    {
        $id = $this->argument('id');
        $account = ConnectedAccount::find($id);

        if (!$account) {
            $this->error("Account not found");
            return;
        }

        $this->info("Account: {$account->email} (ID: {$account->id})\n");

        // Try to decrypt access token
        try {
            $decrypted = $encryption->decrypt($account->access_token);

            $this->line("Access Token (decrypted):");
            $this->line("  Length: " . strlen($decrypted));
            $this->line("  First 100 chars: " . substr($decrypted, 0, 100));
            $this->line("  Last 50 chars: " . substr($decrypted, -50));
            $this->line("  Contains 'Bearer': " . (str_contains($decrypted, 'Bearer') ? 'yes' : 'no'));
            $this->line("  Contains dots: " . (str_contains($decrypted, '.') ? 'yes' : 'no'));
            $this->line("  Appears to be JSON: " . ($this->isJson($decrypted) ? 'yes' : 'no'));

            // Try to detect token type
            if (str_starts_with($decrypted, '{')) {
                $this->line("  <fg=yellow>⚠ Looks like JSON object (might be error response)</>");
                $decoded = json_decode($decrypted, true);
                if ($decoded) {
                    $this->line("  Keys: " . implode(', ', array_keys($decoded)));
                }
            } elseif (str_contains($decrypted, '.')) {
                $this->line("  ✓ Looks like JWT");
            } else {
                $this->line("  ⚠ Opaque token (Microsoft access tokens)");
            }
        } catch (\Exception $e) {
            $this->error("Failed to decrypt access token: " . $e->getMessage());
        }

        // Try to decrypt refresh token
        try {
            $decrypted = $encryption->decrypt($account->refresh_token);
            $this->line("\nRefresh Token (decrypted):");
            $this->line("  Length: " . strlen($decrypted));
            $this->line("  First 50 chars: " . substr($decrypted, 0, 50));
            $this->line("  Is empty: " . (empty($decrypted) ? 'yes' : 'no'));
        } catch (\Exception $e) {
            $this->error("Failed to decrypt refresh token: " . $e->getMessage());
        }
    }

    private function isJson($string)
    {
        json_decode($string);
        return json_last_error() === JSON_ERROR_NONE;
    }
}
