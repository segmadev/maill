<?php

namespace App\Services;

use RuntimeException;

/**
 * AES-256-CBC encryption for OAuth tokens stored in the database.
 *
 * Uses TOKEN_ENCRYPTION_KEY from .env (must be exactly 32 hex characters, i.e. 16 raw bytes).
 * The IV is randomly generated per encryption and prepended to the ciphertext, so every
 * stored value is unique even when the plaintext is identical.
 *
 * Format stored in DB:  base64( iv[16 bytes] + ciphertext )
 */
class TokenEncryptionService
{
    private string $key;
    private const CIPHER = 'AES-256-CBC';
    private const IV_LENGTH = 16;

    public function __construct()
    {
        $hex = config('app.token_encryption_key')
            ?? env('TOKEN_ENCRYPTION_KEY');

        if (empty($hex)) {
            throw new RuntimeException(
                'TOKEN_ENCRYPTION_KEY is not set. ' .
                'Generate one with: php -r "echo bin2hex(random_bytes(16));"'
            );
        }

        // Accept either a 32-char hex string (16 raw bytes) or a 64-char hex (32 raw bytes).
        // AES-256 needs a 32-byte key.
        $raw = hex2bin($hex);
        if ($raw === false || !in_array(strlen($raw), [16, 32], true)) {
            throw new RuntimeException(
                'TOKEN_ENCRYPTION_KEY must be a 32- or 64-character hex string.'
            );
        }

        // Pad 16-byte keys to 32 bytes by doubling (keeps backward compat with 32-char env values).
        $this->key = strlen($raw) === 16 ? str_repeat($raw, 2) : $raw;
    }

    public function encrypt(string $plaintext): string
    {
        $iv = random_bytes(self::IV_LENGTH);

        $ciphertext = openssl_encrypt(
            $plaintext,
            self::CIPHER,
            $this->key,
            OPENSSL_RAW_DATA,
            $iv
        );

        if ($ciphertext === false) {
            throw new RuntimeException('Token encryption failed: ' . openssl_error_string());
        }

        return base64_encode($iv . $ciphertext);
    }

    public function decrypt(string $encoded): string
    {
        $raw = base64_decode($encoded, strict: true);

        if ($raw === false || strlen($raw) <= self::IV_LENGTH) {
            throw new RuntimeException('Token decryption failed: malformed ciphertext.');
        }

        $iv         = substr($raw, 0, self::IV_LENGTH);
        $ciphertext = substr($raw, self::IV_LENGTH);

        $plaintext = openssl_decrypt(
            $ciphertext,
            self::CIPHER,
            $this->key,
            OPENSSL_RAW_DATA,
            $iv
        );

        if ($plaintext === false) {
            throw new RuntimeException('Token decryption failed: ' . openssl_error_string());
        }

        return $plaintext;
    }
}
