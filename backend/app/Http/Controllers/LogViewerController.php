<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class LogViewerController extends Controller
{
    /**
     * GET /api/logs
     * Get list of all log files with metadata
     */
    public function listLogs(Request $request): JsonResponse
    {
        try {
            $logPath = storage_path('logs');

            if (!is_dir($logPath)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Log directory not found',
                ], 500);
            }

            $logs = [];

            // Recursively get all .log files
            $files = $this->getLogFiles($logPath);

            foreach ($files as $filePath) {
                $fileSize = filesize($filePath);
                $relativePath = str_replace($logPath . '/', '', $filePath);

                $logs[] = [
                    'name' => basename($filePath),
                    'path' => $relativePath,
                    'size_bytes' => $fileSize,
                    'size_mb' => round($fileSize / (1024 * 1024), 2),
                    'size_formatted' => $this->formatBytes($fileSize),
                    'modified_at' => date('Y-m-d H:i:s', filemtime($filePath)),
                    'lines_estimate' => round($fileSize / 100), // Rough estimate
                ];
            }

            // Sort by modified time (newest first)
            usort($logs, fn($a, $b) => strtotime($b['modified_at']) - strtotime($a['modified_at']));

            $totalSize = array_sum(array_column($logs, 'size_bytes'));

            return response()->json([
                'success' => true,
                'total_files' => count($logs),
                'total_size_bytes' => $totalSize,
                'total_size_mb' => round($totalSize / (1024 * 1024), 2),
                'total_size_formatted' => $this->formatBytes($totalSize),
                'logs' => $logs,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to list logs: ' . $e->getMessage());
            return response()->json([
                'error' => 'list_failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/logs/content?file=laravel.log
     * Get content of a specific log file
     */
    public function getLogContent(Request $request): JsonResponse
    {
        try {
            $file = $request->query('file');

            if (!$file) {
                return response()->json([
                    'error' => 'missing_file',
                    'message' => 'File parameter required',
                ], 400);
            }

            // Security: Prevent directory traversal
            if (strpos($file, '..') !== false || strpos($file, './') === 0) {
                return response()->json([
                    'error' => 'invalid_file',
                    'message' => 'Invalid file path',
                ], 400);
            }

            $logPath = storage_path('logs/' . $file);

            if (!file_exists($logPath) || !is_file($logPath)) {
                return response()->json([
                    'error' => 'file_not_found',
                    'message' => "File not found: $file",
                ], 404);
            }

            $lines = $request->query('lines', 100); // Default 100 lines
            $lines = min((int)$lines, 1000); // Max 1000 lines
            $offset = $request->query('offset', 0);

            $content = file_get_contents($logPath);
            $allLines = explode("\n", $content);
            $totalLines = count($allLines);

            // Get requested lines (from end)
            $startLine = max(0, $totalLines - $lines - $offset);
            $requestedLines = array_slice($allLines, $startLine, $lines);

            // Parse lines to extract log level and message
            $parsedLines = array_map(function ($line, $index) use ($startLine) {
                return [
                    'line_number' => $startLine + $index + 1,
                    'content' => $line,
                    'level' => $this->extractLogLevel($line),
                ];
            }, $requestedLines, array_keys($requestedLines));

            return response()->json([
                'success' => true,
                'file' => $file,
                'file_size_bytes' => filesize($logPath),
                'file_size_mb' => round(filesize($logPath) / (1024 * 1024), 2),
                'total_lines' => $totalLines,
                'requested_lines' => count($parsedLines),
                'offset' => $offset,
                'lines' => $parsedLines,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to get log content: ' . $e->getMessage());
            return response()->json([
                'error' => 'content_failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/logs/stats
     * Get statistics about all log files
     */
    public function getLogStats(Request $request): JsonResponse
    {
        try {
            $logPath = storage_path('logs');

            if (!is_dir($logPath)) {
                return response()->json([
                    'error' => 'logs_dir_not_found',
                ], 500);
            }

            $stats = [
                'total_files' => 0,
                'total_size_bytes' => 0,
                'by_directory' => [],
                'by_level' => [
                    'ERROR' => 0,
                    'WARNING' => 0,
                    'INFO' => 0,
                    'DEBUG' => 0,
                    'OTHER' => 0,
                ],
                'oldest_log' => null,
                'newest_log' => null,
            ];

            $files = $this->getLogFiles($logPath);
            $times = [];

            foreach ($files as $filePath) {
                $relativePath = str_replace($logPath . '/', '', $filePath);
                $directory = dirname($relativePath) === '.' ? 'root' : dirname($relativePath);

                $fileSize = filesize($filePath);
                $modTime = filemtime($filePath);

                $times[] = $modTime;

                $stats['total_files']++;
                $stats['total_size_bytes'] += $fileSize;

                if (!isset($stats['by_directory'][$directory])) {
                    $stats['by_directory'][$directory] = [
                        'files' => 0,
                        'size_bytes' => 0,
                    ];
                }

                $stats['by_directory'][$directory]['files']++;
                $stats['by_directory'][$directory]['size_bytes'] += $fileSize;

                // Sample log levels from file
                $this->sampleLogLevels($filePath, $stats['by_level']);
            }

            if (!empty($times)) {
                $stats['oldest_log'] = date('Y-m-d H:i:s', min($times));
                $stats['newest_log'] = date('Y-m-d H:i:s', max($times));
            }

            // Format sizes
            foreach ($stats['by_directory'] as &$dir) {
                $dir['size_formatted'] = $this->formatBytes($dir['size_bytes']);
            }

            $stats['total_size_mb'] = round($stats['total_size_bytes'] / (1024 * 1024), 2);
            $stats['total_size_formatted'] = $this->formatBytes($stats['total_size_bytes']);

            return response()->json([
                'success' => true,
                'stats' => $stats,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to get log stats: ' . $e->getMessage());
            return response()->json([
                'error' => 'stats_failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/logs/search?query=error&file=laravel.log
     * Search log files for specific content
     */
    public function searchLogs(Request $request): JsonResponse
    {
        try {
            $query = $request->query('query');
            $file = $request->query('file'); // Optional: search specific file only
            $limit = min((int)$request->query('limit', 100), 500);

            if (!$query) {
                return response()->json([
                    'error' => 'missing_query',
                    'message' => 'Search query required',
                ], 400);
            }

            $logPath = storage_path('logs');
            $results = [];

            if ($file) {
                // Search specific file
                if (strpos($file, '..') !== false) {
                    return response()->json(['error' => 'invalid_file'], 400);
                }
                $filePath = $logPath . '/' . $file;
                if (file_exists($filePath)) {
                    $results = $this->searchFile($filePath, $query, $limit);
                }
            } else {
                // Search all files
                $files = $this->getLogFiles($logPath);
                foreach ($files as $filePath) {
                    if (count($results) >= $limit) {
                        break;
                    }
                    $fileResults = $this->searchFile($filePath, $query, $limit - count($results));
                    $results = array_merge($results, $fileResults);
                }
            }

            return response()->json([
                'success' => true,
                'query' => $query,
                'total_matches' => count($results),
                'limit' => $limit,
                'results' => $results,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to search logs: ' . $e->getMessage());
            return response()->json([
                'error' => 'search_failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    // =========================================================================
    // Helper Methods
    // =========================================================================

    private function getLogFiles(string $directory): array
    {
        $files = [];
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($directory, \RecursiveDirectoryIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $item) {
            if ($item->isFile() && $item->getExtension() === 'log') {
                $files[] = $item->getPathname();
            }
        }

        return $files;
    }

    private function formatBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB'];
        $bytes = max($bytes, 0);
        $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
        $pow = min($pow, count($units) - 1);
        $bytes /= (1 << (10 * $pow));

        return round($bytes, 2) . ' ' . $units[$pow];
    }

    private function extractLogLevel(string $line): string
    {
        if (empty($line)) {
            return 'UNKNOWN';
        }

        if (preg_match('/\[(ERROR|WARNING|INFO|DEBUG)\]/i', $line, $matches)) {
            return strtoupper($matches[1]);
        }

        if (stripos($line, 'error') !== false) {
            return 'ERROR';
        }
        if (stripos($line, 'warning') !== false) {
            return 'WARNING';
        }

        return 'INFO';
    }

    private function sampleLogLevels(string $filePath, array &$stats): void
    {
        $lines = file($filePath, FILE_IGNORE_NEW_LINES);
        $sampleSize = min(100, count($lines)); // Sample first 100 lines

        for ($i = 0; $i < $sampleSize; $i++) {
            $level = $this->extractLogLevel($lines[$i] ?? '');
            $stats[$level]++;
        }
    }

    private function searchFile(string $filePath, string $query, int $limit): array
    {
        $results = [];
        $lines = file($filePath, FILE_IGNORE_NEW_LINES);
        $relPath = str_replace(storage_path('logs/'), '', $filePath);

        foreach ($lines as $lineNum => $line) {
            if (count($results) >= $limit) {
                break;
            }

            if (stripos($line, $query) !== false) {
                $results[] = [
                    'file' => $relPath,
                    'line_number' => $lineNum + 1,
                    'content' => mb_substr($line, 0, 500), // Limit line length
                    'level' => $this->extractLogLevel($line),
                ];
            }
        }

        return $results;
    }
}
