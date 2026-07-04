<?php

namespace App\Console\Commands;

use App\Services\TokenEncryptionService;
use Illuminate\Console\Command;

class TestEncryption extends Command
{
    protected $signature = 'debug:test-encryption';
    protected $description = 'Test encryption/decryption with sample tokens';

    public function handle(TokenEncryptionService $encryption)
    {
        // Test with sample JWT-like token
        $sampleToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

        $this->info("Testing encryption/decryption...\n");

        $this->line("Original token: " . substr($sampleToken, 0, 50) . "...");
        $this->line("Original length: " . strlen($sampleToken));
        $this->line("Original has dots: " . (str_contains($sampleToken, '.') ? 'yes' : 'no'));

        try {
            $encrypted = $encryption->encrypt($sampleToken);
            $this->line("\n<fg=green>✓ Encryption successful</>");
            $this->line("Encrypted length: " . strlen($encrypted));
            $this->line("Encrypted preview: " . substr($encrypted, 0, 50) . "...");

            $decrypted = $encryption->decrypt($encrypted);
            $this->line("\n<fg=green>✓ Decryption successful</>");
            $this->line("Decrypted length: " . strlen($decrypted));
            $this->line("Decrypted has dots: " . (str_contains($decrypted, '.') ? 'yes' : 'no'));

            if ($decrypted === $sampleToken) {
                $this->line("<fg=green>✓ Data integrity verified - round-trip successful</>");
            } else {
                $this->line("<fg=red>✗ DATA MISMATCH!</>");
                $this->line("Expected: " . $sampleToken);
                $this->line("Got:      " . $decrypted);
            }

        } catch (\Exception $e) {
            $this->line("<fg=red>✗ ERROR: " . $e->getMessage() . "</>");
        }
    }
}
