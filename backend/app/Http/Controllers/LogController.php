<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;

class LogController extends Controller
{
    /**
     * Get all log files
     */
    public function listLogs(): JsonResponse
    {
        $logPath = storage_path('logs');
        $logs = [];

        if (File::exists($logPath)) {
            $files = File::files($logPath);

            foreach ($files as $file) {
                $logs[] = [
                    'name' => $file->getFilename(),
                    'path' => $file->getPathname(),
                    'size' => $file->getSize(),
                    'size_kb' => round($file->getSize() / 1024, 2),
                    'modified' => filemtime($file->getPathname()),
                    'modified_at' => date('Y-m-d H:i:s', filemtime($file->getPathname())),
                ];
            }
        }

        // Sort by modified date, newest first
        usort($logs, fn($a, $b) => $b['modified'] <=> $a['modified']);

        return response()->json([
            'logs' => $logs,
            'total_size_kb' => array_sum(array_column($logs, 'size_kb')),
        ]);
    }

    /**
     * Get log file contents
     */
    public function getLog(Request $request): JsonResponse
    {
        $file = $request->query('file');
        if (!$file) {
            return response()->json(['error' => 'missing_file', 'message' => 'File parameter required'], 400);
        }

        $logPath = storage_path('logs/' . $file);
        $logsDir = storage_path('logs');

        // Prevent directory traversal
        $normalized = str_replace('\\', '/', $logPath);
        $normalizedDir = str_replace('\\', '/', $logsDir);
        if (strpos($normalized, $normalizedDir) !== 0) {
            return response()->json(['error' => 'invalid_file', 'message' => 'Invalid file path'], 400);
        }

        if (!File::exists($logPath)) {
            return response()->json(['error' => 'file_not_found', 'message' => 'Log file not found'], 404);
        }

        $contents = File::get($logPath);
        $lines = array_reverse(explode("\n", $contents));

        return response()->json([
            'filename' => $filename,
            'size_kb' => round(filesize($logPath) / 1024, 2),
            'line_count' => count(array_filter($lines)),
            'contents' => implode("\n", $lines),
        ]);
    }

    /**
     * Clear a specific log file
     */
    public function clearLog(Request $request): JsonResponse
    {
        $file = $request->query('file');
        if (!$file) {
            return response()->json(['error' => 'missing_file', 'message' => 'File parameter required'], 400);
        }

        $logPath = storage_path('logs/' . $file);
        $logsDir = storage_path('logs');

        // Prevent directory traversal
        $normalized = str_replace('\\', '/', $logPath);
        $normalizedDir = str_replace('\\', '/', $logsDir);
        if (strpos($normalized, $normalizedDir) !== 0) {
            return response()->json(['error' => 'invalid_file', 'message' => 'Invalid file path'], 400);
        }

        if (!File::exists($logPath)) {
            return response()->json(['error' => 'file_not_found', 'message' => 'Log file not found'], 404);
        }

        try {
            File::put($logPath, '');
            return response()->json(['success' => true, 'message' => "Cleared $file"]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Clear all log files
     */
    public function clearAllLogs(): JsonResponse
    {
        $logPath = storage_path('logs');

        if (!File::exists($logPath)) {
            return response()->json(['error' => 'Log directory not found'], 404);
        }

        try {
            $files = File::files($logPath);
            $cleared = 0;

            foreach ($files as $file) {
                File::put($file->getPathname(), '');
                $cleared++;
            }

            return response()->json([
                'success' => true,
                'message' => "Cleared $cleared log files",
                'cleared_count' => $cleared,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Download a log file
     */
    public function downloadLog(Request $request)
    {
        $file = $request->query('file');
        if (!$file) {
            return response()->json(['error' => 'missing_file', 'message' => 'File parameter required'], 400);
        }

        $logPath = storage_path('logs/' . $file);
        $logsDir = storage_path('logs');

        // Prevent directory traversal
        $normalized = str_replace('\\', '/', $logPath);
        $normalizedDir = str_replace('\\', '/', $logsDir);
        if (strpos($normalized, $normalizedDir) !== 0) {
            return response()->json(['error' => 'invalid_file', 'message' => 'Invalid file path'], 400);
        }

        if (!File::exists($logPath)) {
            return response()->json(['error' => 'file_not_found', 'message' => 'Log file not found'], 404);
        }

        return response()->download($logPath, basename($logPath));
    }
}
