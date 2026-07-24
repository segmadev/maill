<?php

namespace App\Services;

use App\Models\ConnectedAccount;
use Illuminate\Support\Facades\Log;

class SMTPCredentialService
{
    private TokenEncryptionService $encryption;

    public function __construct(TokenEncryptionService $encryption = null)
    {
        $this->encryption = $encryption ?? new TokenEncryptionService();
    }

    /**
     * Encrypt and store SMTP credentials
     */
    public function storeCredentials(ConnectedAccount $account, array $credentials): void
    {
        $encrypted = $this->encryption->encrypt(json_encode([
            'host' => $credentials['host'] ?? null,
            'port' => $credentials['port'] ?? 587,
            'username' => $credentials['username'] ?? null,
            'password' => $credentials['password'] ?? null,
            'encryption' => $credentials['encryption'] ?? 'TLS',
            'from_address' => $credentials['from_address'] ?? null,
            'from_name' => $credentials['from_name'] ?? null,
        ]));

        $account->update([
            'smtp_credentials' => $encrypted,
            'connection_type' => 'smtp',
        ]);

        Log::info("SMTP credentials stored for account", [
            'account_id' => $account->id,
            'email' => $account->email,
        ]);
    }

    /**
     * Get decrypted SMTP credentials
     */
    public function getCredentials(ConnectedAccount $account): ?array
    {
        if (!$account->smtp_credentials) {
            return null;
        }

        try {
            $decrypted = $this->encryption->decrypt($account->smtp_credentials);
            return json_decode($decrypted, true) ?: null;
        } catch (\Exception $e) {
            Log::error("Failed to decrypt SMTP credentials", [
                'account_id' => $account->id,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    /**
     * Validate SMTP connection
     */
    public function validateConnection(array $credentials): bool
    {
        try {
            $transport = new \Swift_SmtpTransport(
                $credentials['host'] ?? 'localhost',
                $credentials['port'] ?? 587,
                $credentials['encryption'] ?? 'TLS'
            );

            $transport->setUsername($credentials['username'] ?? null);
            $transport->setPassword($credentials['password'] ?? null);
            $transport->setLocalDomain('localhost');

            // Test connection
            $transport->start();
            $transport->stop();

            return true;
        } catch (\Exception $e) {
            Log::warning("SMTP connection validation failed", [
                'host' => $credentials['host'] ?? null,
                'error' => $e->getMessage(),
            ]);
            return false;
        }
    }

    /**
     * Update only the password for existing credentials
     */
    public function updatePassword(ConnectedAccount $account, string $newPassword): void
    {
        $credentials = $this->getCredentials($account);
        if (!$credentials) {
            return;
        }

        $credentials['password'] = $newPassword;
        $this->storeCredentials($account, $credentials);
    }

    /**
     * Get formatted DSN for Laravel mail driver
     */
    public function getDSN(array $credentials): ?string
    {
        if (!isset($credentials['host'], $credentials['username'], $credentials['password'])) {
            return null;
        }

        $encryption = $credentials['encryption'] ?? 'tls';
        $port = $credentials['port'] ?? 587;

        return "smtp://{$credentials['username']}:{$credentials['password']}"
            . "@{$credentials['host']}:{$port}"
            . "?encryption={$encryption}";
    }

    /**
     * Mask password for logging
     */
    public function maskCredentials(array $credentials): array
    {
        $masked = $credentials;
        if (isset($masked['password'])) {
            $masked['password'] = '***MASKED***';
        }
        return $masked;
    }
}
