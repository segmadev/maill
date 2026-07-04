<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\File;
use Carbon\Carbon;

class GraphAPILogger
{
    private string $logFilePath;

    public function __construct()
    {
        $logDir = storage_path('logs/graph-api');
        if (!File::isDirectory($logDir)) {
            File::makeDirectory($logDir, 0755, true);
        }

        $date = Carbon::now()->format('Y-m-d');
        $this->logFilePath = $logDir . '/graph-api-' . $date . '.log';
    }

    /**
     * Log outgoing HTTP request to Microsoft Graph
     */
    public function logRequest(string $method, string $url, array $headers = [], $body = null, ?int $accountId = null)
    {
        $timestamp = Carbon::now()->format('Y-m-d H:i:s.u');
        $separator = str_repeat('=', 100);

        $logMessage = "\n{$separator}\n";
        $logMessage .= "[{$timestamp}] OUTGOING REQUEST\n";
        $logMessage .= $separator . "\n";

        if ($accountId) {
            $logMessage .= "Account ID: {$accountId}\n";
        }

        $logMessage .= "Method: {$method}\n";
        $logMessage .= "URL: {$url}\n";
        $logMessage .= "\nHeaders:\n";

        // Log headers but mask sensitive tokens
        foreach ($headers as $key => $value) {
            if (in_array(strtolower($key), ['authorization', 'x-ms-client-request-id', 'content-type'])) {
                if (strtolower($key) === 'authorization') {
                    $maskedValue = 'Bearer ' . substr($value, 0, 20) . '...MASKED...';
                    $logMessage .= "  {$key}: {$maskedValue}\n";
                } else {
                    $logMessage .= "  {$key}: {$value}\n";
                }
            }
        }

        if ($body) {
            $logMessage .= "\nBody:\n";
            if (is_array($body) || is_object($body)) {
                $logMessage .= json_encode($body, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
            } else {
                $logMessage .= (string)$body . "\n";
            }
        }

        File::append($this->logFilePath, $logMessage);
        Log::debug('GraphAPI Request', [
            'method' => $method,
            'url' => $url,
            'account_id' => $accountId,
        ]);
    }

    /**
     * Log incoming HTTP response from Microsoft Graph
     */
    public function logResponse(int $statusCode, array $headers = [], $body = null, ?int $accountId = null, float $duration = 0)
    {
        $timestamp = Carbon::now()->format('Y-m-d H:i:s.u');

        $logMessage = "\n[{$timestamp}] INCOMING RESPONSE\n";
        $logMessage .= "Status Code: {$statusCode}\n";

        if ($accountId) {
            $logMessage .= "Account ID: {$accountId}\n";
        }

        $logMessage .= "Duration: {$duration}ms\n";
        $logMessage .= "\nResponse Headers:\n";

        foreach ($headers as $key => $value) {
            // Handle array header values (join with comma)
            $headerValue = is_array($value) ? implode(', ', $value) : (string)$value;
            $logMessage .= "  {$key}: {$headerValue}\n";
        }

        $logMessage .= "\nResponse Body:\n";

        if ($body) {
            if (is_array($body) || is_object($body)) {
                $logMessage .= json_encode($body, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
            } else {
                $logMessage .= (string)$body . "\n";
            }
        }

        $logMessage .= "\n";

        File::append($this->logFilePath, $logMessage);
        Log::debug('GraphAPI Response', [
            'status_code' => $statusCode,
            'account_id' => $accountId,
            'duration_ms' => $duration,
        ]);
    }

    /**
     * Log token refresh operation
     */
    public function logTokenRefresh(int $accountId, string $action, $data = null)
    {
        $timestamp = Carbon::now()->format('Y-m-d H:i:s.u');
        $separator = str_repeat('-', 100);

        $logMessage = "\n{$separator}\n";
        $logMessage .= "[{$timestamp}] TOKEN REFRESH: {$action}\n";
        $logMessage .= "{$separator}\n";
        $logMessage .= "Account ID: {$accountId}\n";

        if ($data) {
            $logMessage .= "Details:\n";
            if (is_array($data) || is_object($data)) {
                $logMessage .= json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
            } else {
                $logMessage .= (string)$data . "\n";
            }
        }

        $logMessage .= "\n";

        File::append($this->logFilePath, $logMessage);
        Log::info('GraphAPI Token Refresh', [
            'account_id' => $accountId,
            'action' => $action,
        ]);
    }

    /**
     * Log error
     */
    public function logError(int $accountId, string $action, \Exception $exception)
    {
        $timestamp = Carbon::now()->format('Y-m-d H:i:s.u');
        $separator = str_repeat('*', 100);

        $logMessage = "\n{$separator}\n";
        $logMessage .= "[{$timestamp}] ERROR: {$action}\n";
        $logMessage .= "{$separator}\n";
        $logMessage .= "Account ID: {$accountId}\n";
        $logMessage .= "Exception Class: " . get_class($exception) . "\n";
        $logMessage .= "Message: " . $exception->getMessage() . "\n";
        $logMessage .= "Code: " . $exception->getCode() . "\n";
        $logMessage .= "File: " . $exception->getFile() . ":" . $exception->getLine() . "\n";
        $logMessage .= "\nStack Trace:\n" . $exception->getTraceAsString() . "\n";
        $logMessage .= "\n";

        File::append($this->logFilePath, $logMessage);
        Log::error('GraphAPI Error', [
            'account_id' => $accountId,
            'action' => $action,
            'exception' => $exception->getMessage(),
        ]);
    }

    /**
     * Get the log file path
     */
    public function getLogFilePath(): string
    {
        return $this->logFilePath;
    }

    /**
     * Get today's log file contents
     */
    public function getLogContents(): string
    {
        if (File::exists($this->logFilePath)) {
            return File::get($this->logFilePath);
        }
        return 'Log file not found.';
    }
}
