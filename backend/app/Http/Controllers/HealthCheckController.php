<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class HealthCheckController extends Controller
{
    /**
     * GET /api/health
     * Basic health check - quick status
     */
    public function check(): JsonResponse
    {
        try {
            // Test database connection
            DB::connection()->getPdo();

            return response()->json([
                'status' => 'healthy',
                'timestamp' => now()->toIso8601String(),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'status' => 'unhealthy',
                'error' => 'Database connection failed',
                'timestamp' => now()->toIso8601String(),
            ], 503);
        }
    }

    /**
     * GET /api/health/detailed
     * Detailed health check - checks all systems
     */
    public function detailed(): JsonResponse
    {
        $health = [
            'status' => 'healthy',
            'timestamp' => now()->toIso8601String(),
            'checks' => [],
        ];

        // Database check
        try {
            DB::connection()->getPdo();
            $health['checks']['database'] = [
                'status' => 'ok',
                'message' => 'Connected',
            ];
        } catch (\Exception $e) {
            $health['status'] = 'unhealthy';
            $health['checks']['database'] = [
                'status' => 'failed',
                'message' => $e->getMessage(),
            ];
        }

        // Memory check
        $memoryMB = round(memory_get_usage() / 1024 / 1024, 2);
        $memoryLimitMB = round(memory_get_usage(true) / 1024 / 1024, 2);
        $health['checks']['memory'] = [
            'status' => $memoryMB > 150 ? 'warning' : 'ok',
            'used_mb' => $memoryMB,
            'limit_mb' => $memoryLimitMB,
            'percentage' => round(($memoryMB / $memoryLimitMB) * 100, 1),
        ];

        if ($memoryMB > 150) {
            $health['status'] = 'degraded';
        }

        // Disk space check
        $diskFree = disk_free_space('/') / 1024 / 1024 / 1024;
        $diskTotal = disk_total_space('/') / 1024 / 1024 / 1024;
        $diskUsed = $diskTotal - $diskFree;
        $diskPercent = round(($diskUsed / $diskTotal) * 100, 1);

        $health['checks']['disk'] = [
            'status' => $diskPercent > 90 ? 'critical' : ($diskPercent > 75 ? 'warning' : 'ok'),
            'free_gb' => round($diskFree, 2),
            'total_gb' => round($diskTotal, 2),
            'used_gb' => round($diskUsed, 2),
            'percentage' => $diskPercent,
        ];

        if ($diskPercent > 90) {
            $health['status'] = 'critical';
        }

        // Log file size check
        $logFile = storage_path('logs/laravel.log');
        if (file_exists($logFile)) {
            $logSizeMB = round(filesize($logFile) / 1024 / 1024, 2);
            $health['checks']['logs'] = [
                'status' => $logSizeMB > 50 ? 'warning' : 'ok',
                'size_mb' => $logSizeMB,
                'threshold_mb' => 50,
            ];

            if ($logSizeMB > 50) {
                $health['status'] = 'degraded';
            }
        }

        // Cache check
        try {
            Cache::put('health_check_test', true, 60);
            Cache::get('health_check_test');
            $health['checks']['cache'] = ['status' => 'ok'];
        } catch (\Exception $e) {
            $health['checks']['cache'] = [
                'status' => 'warning',
                'message' => $e->getMessage(),
            ];
        }

        // Token renewal process check
        try {
            $status = \App\Models\SystemStatus::where('key', 'token_renewal_running')->first();
            if ($status) {
                $value = $status->value ?? [];
                $startedAt = $value['started_at'] ?? null;
                $elapsed = $startedAt ? (time() - strtotime($startedAt)) : 0;

                $health['checks']['token_renewal'] = [
                    'status' => $elapsed > 900 ? 'warning' : 'running',
                    'running' => true,
                    'elapsed_seconds' => $elapsed,
                    'warning' => $elapsed > 900 ? 'Renewal running longer than expected' : null,
                ];

                if ($elapsed > 900) {
                    $health['status'] = 'degraded';
                }
            } else {
                $health['checks']['token_renewal'] = ['status' => 'idle'];
            }
        } catch (\Exception $e) {
            $health['checks']['token_renewal'] = [
                'status' => 'unknown',
                'message' => $e->getMessage(),
            ];
        }

        $statusCode = $health['status'] === 'healthy' ? 200 : ($health['status'] === 'critical' ? 503 : 200);

        return response()->json($health, $statusCode);
    }

    /**
     * GET /api/health/restart-warning
     * Check if server needs restart due to resource issues
     */
    public function restartWarning(): JsonResponse
    {
        $warnings = [];

        // Memory warning
        $memoryMB = round(memory_get_usage() / 1024 / 1024, 2);
        if ($memoryMB > 150) {
            $warnings[] = [
                'type' => 'memory',
                'severity' => 'high',
                'message' => "Memory usage at {$memoryMB}MB - consider restarting",
            ];
        }

        // Disk space warning
        $diskFree = disk_free_space('/') / 1024 / 1024 / 1024;
        $diskTotal = disk_total_space('/') / 1024 / 1024 / 1024;
        $diskPercent = round((($diskTotal - $diskFree) / $diskTotal) * 100, 1);

        if ($diskPercent > 90) {
            $warnings[] = [
                'type' => 'disk',
                'severity' => 'critical',
                'message' => "Disk usage at {$diskPercent}% - restart recommended",
            ];
        }

        // Long-running renewal process
        $status = \App\Models\SystemStatus::where('key', 'token_renewal_running')->first();
        if ($status) {
            $value = $status->value ?? [];
            $elapsed = time() - strtotime($value['started_at'] ?? now());
            if ($elapsed > 900) {
                $warnings[] = [
                    'type' => 'process',
                    'severity' => 'high',
                    'message' => "Token renewal running for {$elapsed}s - may need restart",
                ];
            }
        }

        return response()->json([
            'needs_restart' => !empty($warnings),
            'warning_count' => count($warnings),
            'warnings' => $warnings,
            'timestamp' => now()->toIso8601String(),
        ]);
    }
}
