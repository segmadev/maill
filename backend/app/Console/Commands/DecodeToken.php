<?php

namespace App\Console\Commands;

use App\Models\ConnectedAccount;
use App\Services\TokenEncryptionService;
use Illuminate\Console\Command;

class DecodeToken extends Command
{
    protected $signature = 'debug:decode-token {id}';
    protected $description = 'Decode and analyze a stored token';

    public function handle(TokenEncryptionService $encryption)
    {
        $id = $this->argument('id');
        $account = ConnectedAccount::find($id);

        if (!$account) {
            $this->error("Account not found");
            return;
        }

        $token = $encryption->decrypt($account->access_token);

        $this->info("Token Analysis for {$account->email}\n");

        $this->line("Raw token length: " . strlen($token));
        $this->line("First 100 chars: " . substr($token, 0, 100));
        $this->line("Last 50 chars: " . substr($token, -50));

        // Try base64 decode
        $decoded = @base64_decode($token, true);
        if ($decoded && strlen($decoded) > 0) {
            $this->line("\n<fg=green>✓ Token can be base64 decoded</>");
            $this->line("Decoded length: " . strlen($decoded));
            $this->line("Decoded first 100 chars: " . substr($decoded, 0, 100));

            // Try JSON
            $json = json_decode($decoded, true);
            if ($json) {
                $this->line("\n<fg=green>✓ Decoded data is JSON</>");
                $this->line("Keys: " . implode(', ', array_keys($json)));
                if (isset($json['access_token'])) {
                    $this->line("\n⚠️  Found nested 'access_token' key!");
                    $actualToken = $json['access_token'];
                    $this->line("Nested token length: " . strlen($actualToken));
                    $this->line("Nested token first 50: " . substr($actualToken, 0, 50));
                }
            }
        } else {
            $this->line("\n✓ Token is NOT base64 encoded (opaque token - correct for Microsoft)");
        }
    }
}
