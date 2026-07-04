<?php

namespace App\Services;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\ClientException;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Handler\StreamHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Pool;
use GuzzleHttp\Psr7\Request;
use RuntimeException;

/**
 * Thin wrapper around Microsoft Graph API v1.0.
 *
 * Every method receives a decrypted access token — token refresh is handled
 * upstream by TokenRefreshMiddleware before any controller runs.
 *
 * Rate limit: Microsoft allows ~10,000 requests / 10 min per app.
 * All methods throw \RuntimeException on HTTP errors with a machine-readable
 * error code so controllers can map them to structured JSON responses.
 */
class GraphApiService
{
    private const BASE = 'https://graph.microsoft.com/v1.0';

    private Client $http;
    private GraphAPILogger $logger;

    public function __construct(GraphAPILogger $logger = null)
    {
        // Use PHP's stream handler instead of cURL so that c-ares (the async DNS
        // resolver compiled into this libcurl build) is bypassed entirely.
        // PHP streams use the system resolver, which works correctly on this host.
        $this->http = new Client([
            'timeout' => 15,
            'headers' => ['Accept' => 'application/json'],
            'handler' => HandlerStack::create(new StreamHandler()),
        ]);

        $this->logger = $logger ?? new GraphAPILogger();
    }

    // =========================================================================
    // Folders
    // =========================================================================

    /**
     * List all mail folders for the signed-in user.
     *
     * @return array<int, array{id, displayName, parentFolderId, totalItemCount, unreadItemCount}>
     */
    public function getFolders(string $accessToken): array
    {
        $data = $this->get('/me/mailFolders', $accessToken, [
            '$top'              => 100,
            '$select'           => 'id,displayName,parentFolderId,totalItemCount,unreadItemCount',
            'includeHiddenFolders' => 'false',
        ]);

        return $data['value'] ?? [];
    }

    // =========================================================================
    // Messages
    // =========================================================================

    /**
     * List messages in a folder (metadata only — no body).
     *
     * @return array{value: array, '@odata.nextLink'?: string}
     */
    public function getMessages(
        string $accessToken,
        string $folderId,
        int    $top  = 50,
        int    $skip = 0
    ): array {
        return $this->get(
            "/me/mailFolders/{$folderId}/messages",
            $accessToken,
            [
                '$top'     => $top,
                '$skip'    => $skip,
                '$orderby' => 'receivedDateTime desc',
                '$select'  => implode(',', [
                    'id', 'subject', 'bodyPreview',
                    'from', 'toRecipients', 'ccRecipients',
                    'receivedDateTime', 'isRead',
                    'hasAttachments', 'importance',
                ]),
            ]
        );
    }

    /**
     * Fetch a single message including full HTML body.
     *
     * @return array{id, subject, body, from, toRecipients, ccRecipients, attachments?, ...}
     */
    public function getMessage(string $accessToken, string $messageId): array
    {
        return $this->get("/me/messages/{$messageId}", $accessToken, [
            '$select' => implode(',', [
                'id', 'subject', 'body', 'bodyPreview',
                'from', 'toRecipients', 'ccRecipients', 'bccRecipients',
                'replyTo', 'sender', 'receivedDateTime', 'sentDateTime',
                'isRead', 'hasAttachments', 'importance', 'internetMessageHeaders',
            ]),
        ]);
    }

    /**
     * List attachments for a message.
     */
    public function getAttachments(string $accessToken, string $messageId): array
    {
        $data = $this->get("/me/messages/{$messageId}/attachments", $accessToken, [
            '$select' => 'id,name,contentType,size,isInline',
        ]);
        return $data['value'] ?? [];
    }

    /**
     * Send a new email or reply.
     *
     * $payload shape:
     * {
     *   message: {
     *     subject, body: {contentType, content},
     *     toRecipients: [{emailAddress: {address, name}}],
     *     ccRecipients?: [...],
     *   },
     *   saveToSentItems: true
     * }
     */
    public function sendMail(string $accessToken, array $payload): bool
    {
        $this->post('/me/sendMail', $accessToken, $payload);
        return true;
    }

    /**
     * Reply to a message.
     */
    public function replyToMessage(string $accessToken, string $messageId, string $comment, array $message = []): bool
    {
        $body = ['comment' => $comment];
        if (!empty($message)) {
            $body['message'] = $message;
        }
        $this->post("/me/messages/{$messageId}/reply", $accessToken, $body);
        return true;
    }

    /**
     * Reply-all to a message.
     */
    public function replyAllToMessage(string $accessToken, string $messageId, string $comment): bool
    {
        $this->post("/me/messages/{$messageId}/replyAll", $accessToken, ['comment' => $comment]);
        return true;
    }

    /**
     * Forward a message.
     */
    public function forwardMessage(string $accessToken, string $messageId, string $comment, array $toRecipients): bool
    {
        $this->post("/me/messages/{$messageId}/forward", $accessToken, [
            'comment'      => $comment,
            'toRecipients' => $toRecipients,
        ]);
        return true;
    }

    /**
     * Move a message to a destination folder (use 'deleteditems' for trash).
     *
     * @return array  The updated message object from Graph
     */
    public function moveMessage(string $accessToken, string $messageId, string $destinationFolderId): array
    {
        return $this->post(
            "/me/messages/{$messageId}/move",
            $accessToken,
            ['destinationId' => $destinationFolderId]
        );
    }

    /**
     * PATCH a message (e.g. mark read/unread).
     */
    public function patchMessage(string $accessToken, string $messageId, array $properties): array
    {
        return $this->patch("/me/messages/{$messageId}", $accessToken, $properties);
    }

    /**
     * Mark a message read or unread.
     */
    public function markRead(string $accessToken, string $messageId, bool $isRead): bool
    {
        $this->patchMessage($accessToken, $messageId, ['isRead' => $isRead]);
        return true;
    }

    /**
     * Permanently delete a message (use moveMessage to 'deleteditems' for soft-delete).
     */
    public function deleteMessage(string $accessToken, string $messageId): bool
    {
        $this->delete("/me/messages/{$messageId}", $accessToken);
        return true;
    }

    // =========================================================================
    // Search
    // =========================================================================

    /**
     * Search messages across a mailbox using Graph's $search parameter.
     *
     * Returns up to 25 results (Graph's default for search queries).
     *
     * @return array<int, array>
     */
    public function searchMessages(string $accessToken, string $query): array
    {
        $data = $this->get('/me/messages', $accessToken, [
            '$search'  => '"' . addslashes($query) . '"',
            '$top'     => 25,
            '$select'  => 'id,subject,bodyPreview,from,receivedDateTime,isRead,hasAttachments',
        ]);
        return $data['value'] ?? [];
    }

    // =========================================================================
    // Concurrent search across multiple accounts (used by SearchController)
    // =========================================================================

    /**
     * Fire parallel Graph search requests — one per access token — and merge results.
     *
     * @param array<int, array{account_id: int, access_token: string}> $accounts
     * @return array<int, array>  Each result has an injected 'account_id' key
     */
    public function searchMessagesMultiAccount(array $accounts, string $query): array
    {
        if (empty($accounts)) {
            return [];
        }

        $uri    = self::BASE . '/me/messages?' . http_build_query([
            '$search'  => '"' . addslashes($query) . '"',
            '$top'     => 25,
            '$select'  => 'id,subject,bodyPreview,from,receivedDateTime,isRead,hasAttachments',
        ]);
        $results = [];

        // Build one Guzzle request per account
        $requests = function () use ($accounts, $uri) {
            foreach ($accounts as $account) {
                yield new Request('GET', $uri, [
                    'Authorization' => 'Bearer ' . $account['access_token'],
                    'Accept'        => 'application/json',
                ]);
            }
        };

        $pool = new Pool($this->http, $requests(), [
            'concurrency' => 5,
            'fulfilled'   => function ($response, int $index) use ($accounts, &$results) {
                $data     = json_decode((string) $response->getBody(), true);
                $messages = $data['value'] ?? [];
                $accountId = $accounts[$index]['account_id'];
                foreach ($messages as $msg) {
                    $results[] = array_merge($msg, ['account_id' => $accountId]);
                }
            },
            'rejected'    => function ($reason, int $index) {
                // Silently skip failed accounts — they may have revoked tokens.
            },
        ]);

        $pool->promise()->wait();

        // Sort merged results by receivedDateTime descending
        usort($results, fn ($a, $b) => strcmp(
            $b['receivedDateTime'] ?? '',
            $a['receivedDateTime'] ?? ''
        ));

        return $results;
    }

    /**
     * Keyword Query Language (KQL) search across multiple accounts in parallel.
     *
     * Unlike searchMessagesMultiAccount(), the $kqlQuery is NOT auto-quoted so
     * OR expressions work correctly: "invoice" OR urgent OR "payment due"
     *
     * Also adds parentFolderId and importance to $select so the caller can
     * upsert results back to the local email cache with folder context.
     *
     * @param array<int, array{account_id: int, access_token: string}> $accounts
     * @param string $kqlQuery  Raw KQL string, e.g. 'invoice OR "payment due"'
     * @return array<int, array>  Each result has 'account_id' injected
     */
    public function searchKQLMultiAccount(array $accounts, string $kqlQuery): array
    {
        if (empty($accounts)) {
            return [];
        }

        $uri     = self::BASE . '/me/messages?' . http_build_query([
            '$search'  => $kqlQuery,      // NO outer quotes — KQL needs bare OR
            '$top'     => 50,
            '$select'  => implode(',', [
                'id', 'subject', 'bodyPreview',
                'from', 'receivedDateTime',
                'isRead', 'hasAttachments', 'importance',
                'parentFolderId',           // needed to map to local folder_id
            ]),
        ]);
        $results = [];

        $requests = function () use ($accounts, $uri) {
            foreach ($accounts as $account) {
                yield new Request('GET', $uri, [
                    'Authorization' => 'Bearer ' . $account['access_token'],
                    'Accept'        => 'application/json',
                ]);
            }
        };

        $pool = new Pool($this->http, $requests(), [
            'concurrency' => 5,
            'fulfilled'   => function ($response, int $index) use ($accounts, &$results) {
                $data      = json_decode((string) $response->getBody(), true);
                $messages  = $data['value'] ?? [];
                $accountId = $accounts[$index]['account_id'];
                foreach ($messages as $msg) {
                    $results[] = array_merge($msg, ['account_id' => $accountId]);
                }
            },
            'rejected' => function () {},   // silently skip revoked tokens
        ]);

        $pool->promise()->wait();

        usort($results, fn ($a, $b) => strcmp(
            $b['receivedDateTime'] ?? '',
            $a['receivedDateTime'] ?? ''
        ));

        return $results;
    }

    // =========================================================================
    // HTTP helpers
    // =========================================================================

    private function get(string $path, string $token, array $query = []): array
    {
        try {
            // Validate token before using
            if (empty($token)) {
                throw new RuntimeException("Empty token provided to GET request");
            }

            // Note: Microsoft's opaque tokens don't have dots, so we can't validate for that
            // Just ensure the token isn't obviously corrupted (very short or contains invalid chars)
            if (strlen($token) < 100) {
                throw new RuntimeException("Token appears to be truncated or invalid (length: " . strlen($token) . ")");
            }

            $url = self::BASE . $path;
            $headers = ['Authorization' => "Bearer {$token}"];
            $startTime = microtime(true);

            $this->logger->logRequest('GET', $url . ($query ? '?' . http_build_query($query) : ''), $headers);

            $response = $this->http->get($url, [
                'headers' => $headers,
                'query'   => $query,
            ]);

            $duration = (microtime(true) - $startTime) * 1000;
            $body = (string) $response->getBody();
            $decodedBody = json_decode($body, true) ?? [];

            $this->logger->logResponse(
                $response->getStatusCode(),
                $response->getHeaders(),
                $decodedBody,
                null,
                $duration
            );

            return $decodedBody;
        } catch (ClientException $e) {
            $duration = (microtime(true) - $startTime) * 1000;
            $this->logger->logResponse(
                $e->getResponse()->getStatusCode(),
                $e->getResponse()->getHeaders(),
                json_decode((string) $e->getResponse()->getBody(), true),
                null,
                $duration
            );
            $this->throwGraphError($e);
        } catch (GuzzleException $e) {
            $this->logger->logError(0, 'GET ' . $url, $e);
            throw new RuntimeException('graph_network_error: ' . $e->getMessage(), 0, $e);
        }
    }

    private function post(string $path, string $token, array $body = []): array
    {
        try {
            // Validate token format before using
            if (empty($token)) {
                throw new RuntimeException("Empty token provided to POST request");
            }

            // Note: Microsoft's opaque tokens don't have dots, so we can't validate for that
            // Just ensure the token isn't obviously corrupted (very short or contains invalid chars)
            if (strlen($token) < 100) {
                throw new RuntimeException("Token appears to be truncated or invalid (length: " . strlen($token) . ")");
            }

            $url = self::BASE . $path;
            $headers = [
                'Authorization' => "Bearer {$token}",
                'Content-Type'  => 'application/json',
            ];
            $startTime = microtime(true);

            $this->logger->logRequest('POST', $url, $headers, $body);

            $response = $this->http->post($url, [
                'headers' => $headers,
                'json' => $body,
            ]);

            $duration = (microtime(true) - $startTime) * 1000;
            $raw = (string) $response->getBody();
            $decodedBody = $raw ? (json_decode($raw, true) ?? []) : [];

            $this->logger->logResponse(
                $response->getStatusCode(),
                $response->getHeaders(),
                $decodedBody,
                null,
                $duration
            );

            return $decodedBody;
        } catch (ClientException $e) {
            $duration = (microtime(true) - $startTime) * 1000;
            $this->logger->logResponse(
                $e->getResponse()->getStatusCode(),
                $e->getResponse()->getHeaders(),
                json_decode((string) $e->getResponse()->getBody(), true),
                null,
                $duration
            );
            $this->throwGraphError($e);
        } catch (GuzzleException $e) {
            $this->logger->logError(0, 'POST ' . $url, $e);
            throw new RuntimeException('graph_network_error: ' . $e->getMessage(), 0, $e);
        }
    }

    private function patch(string $path, string $token, array $body = []): array
    {
        try {
            $url = self::BASE . $path;
            $headers = [
                'Authorization' => "Bearer {$token}",
                'Content-Type'  => 'application/json',
            ];
            $startTime = microtime(true);

            $this->logger->logRequest('PATCH', $url, $headers, $body);

            $response = $this->http->patch($url, [
                'headers' => $headers,
                'json' => $body,
            ]);

            $duration = (microtime(true) - $startTime) * 1000;
            $decodedBody = json_decode((string) $response->getBody(), true) ?? [];

            $this->logger->logResponse(
                $response->getStatusCode(),
                $response->getHeaders(),
                $decodedBody,
                null,
                $duration
            );

            return $decodedBody;
        } catch (ClientException $e) {
            $duration = (microtime(true) - $startTime) * 1000;
            $this->logger->logResponse(
                $e->getResponse()->getStatusCode(),
                $e->getResponse()->getHeaders(),
                json_decode((string) $e->getResponse()->getBody(), true),
                null,
                $duration
            );
            $this->throwGraphError($e);
        } catch (GuzzleException $e) {
            $this->logger->logError(0, 'PATCH ' . $url, $e);
            throw new RuntimeException('graph_network_error: ' . $e->getMessage(), 0, $e);
        }
    }

    private function delete(string $path, string $token): void
    {
        try {
            $url = self::BASE . $path;
            $headers = ['Authorization' => "Bearer {$token}"];
            $startTime = microtime(true);

            $this->logger->logRequest('DELETE', $url, $headers);

            $this->http->delete($url, [
                'headers' => $headers,
            ]);

            $duration = (microtime(true) - $startTime) * 1000;
            $this->logger->logResponse(204, [], [], null, $duration);
        } catch (ClientException $e) {
            $duration = (microtime(true) - $startTime) * 1000;
            $this->logger->logResponse(
                $e->getResponse()->getStatusCode(),
                $e->getResponse()->getHeaders(),
                json_decode((string) $e->getResponse()->getBody(), true),
                null,
                $duration
            );
            $this->throwGraphError($e);
        } catch (GuzzleException $e) {
            $this->logger->logError(0, 'DELETE ' . $url, $e);
            throw new RuntimeException('graph_network_error: ' . $e->getMessage(), 0, $e);
        }
    }

    /** Map Graph 4xx errors to descriptive RuntimeExceptions. */
    private function throwGraphError(ClientException $e): never
    {
        $status = $e->getResponse()->getStatusCode();
        $body   = json_decode((string) $e->getResponse()->getBody(), true);
        $code   = $body['error']['code']    ?? 'unknown';
        $msg    = $body['error']['message'] ?? $e->getMessage();

        throw match (true) {
            $status === 401 => new RuntimeException("graph_unauthorized: {$msg}", 401, $e),
            $status === 403 => new RuntimeException("graph_forbidden: {$msg}", 403, $e),
            $status === 404 => new RuntimeException("graph_not_found: {$msg}", 404, $e),
            $status === 429 => new RuntimeException("graph_rate_limited: Retry-After " .
                ($e->getResponse()->getHeaderLine('Retry-After') ?: '60') . 's', 429, $e),
            default         => new RuntimeException("graph_error_{$code}: {$msg}", $status, $e),
        };
    }
}
