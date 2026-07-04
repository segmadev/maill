<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;

/**
 * JSON flat-file cache for email bodies and attachments.
 *
 * Keeps full HTML bodies out of MySQL (avoids large BLOBs and keeps the
 * emails table fast for list/search queries).
 *
 * Storage path:  storage/app/email_cache/{account_id}/{message_id}.json
 *
 * Cached payload shape:
 * {
 *   "subject":      string,
 *   "body_html":    string,
 *   "body_text":    string,
 *   "attachments":  [{id, name, contentType, size, isInline}],
 *   "headers":      [{name, value}],
 *   "cached_at":    ISO8601 string
 * }
 */
class EmailCacheService
{
    private const DISK = 'local';

    // -------------------------------------------------------------------------
    // Read
    // -------------------------------------------------------------------------

    public function has(int $accountId, string $messageId): bool
    {
        return Storage::disk(self::DISK)->exists($this->path($accountId, $messageId));
    }

    /**
     * @return array|null  Null if not cached
     */
    public function get(int $accountId, string $messageId): ?array
    {
        $path = $this->path($accountId, $messageId);

        if (!Storage::disk(self::DISK)->exists($path)) {
            return null;
        }

        $raw = Storage::disk(self::DISK)->get($path);
        return json_decode($raw, true);
    }

    // -------------------------------------------------------------------------
    // Write
    // -------------------------------------------------------------------------

    /**
     * Build the cache payload from a raw Graph message object and persist it.
     *
     * @param array $graphMessage  Full message returned by GraphApiService::getMessage()
     */
    public function put(int $accountId, array $graphMessage): void
    {
        $body        = $graphMessage['body'] ?? [];
        $contentType = strtolower($body['contentType'] ?? 'text');

        $payload = [
            'subject'     => $graphMessage['subject'] ?? '',
            'body_html'   => $contentType === 'html'  ? ($body['content'] ?? '') : '',
            'body_text'   => $contentType === 'text'  ? ($body['content'] ?? '') : '',
            'attachments' => $this->normalizeAttachments($graphMessage['attachments'] ?? []),
            'headers'     => $graphMessage['internetMessageHeaders'] ?? [],
            'cached_at'   => now()->toISOString(),
        ];

        Storage::disk(self::DISK)->put(
            $this->path($accountId, $graphMessage['id']),
            json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
        );
    }

    // -------------------------------------------------------------------------
    // Delete
    // -------------------------------------------------------------------------

    public function forget(int $accountId, string $messageId): void
    {
        $path = $this->path($accountId, $messageId);
        if (Storage::disk(self::DISK)->exists($path)) {
            Storage::disk(self::DISK)->delete($path);
        }
    }

    /** Delete all cached messages for an account (called when account is disconnected). */
    public function forgetAccount(int $accountId): void
    {
        $dir = "email_cache/{$accountId}";
        if (Storage::disk(self::DISK)->directoryExists($dir)) {
            Storage::disk(self::DISK)->deleteDirectory($dir);
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function path(int $accountId, string $messageId): string
    {
        // Sanitize the Graph message ID — it can contain characters unsafe for filenames.
        $safe = preg_replace('/[^A-Za-z0-9_\-]/', '_', $messageId);
        return "email_cache/{$accountId}/{$safe}.json";
    }

    private function normalizeAttachments(array $attachments): array
    {
        return array_map(fn ($a) => [
            'id'          => $a['id']          ?? '',
            'name'        => $a['name']         ?? 'attachment',
            'contentType' => $a['contentType']  ?? 'application/octet-stream',
            'size'        => $a['size']         ?? 0,
            'isInline'    => $a['isInline']     ?? false,
        ], $attachments);
    }
}
