<?php

namespace App\Http\Controllers;

use App\Services\GraphAPILogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\File;

class GraphAPILogController extends Controller
{
    public function __construct(private GraphAPILogger $logger) {}

    /**
     * Get today's Graph API logs
     */
    public function getLogs(): Response
    {
        $contents = $this->logger->getLogContents();

        return response($contents)
            ->header('Content-Type', 'text/plain; charset=utf-8')
            ->header('Content-Disposition', 'inline; filename="graph-api.log"');
    }

    /**
     * Download today's Graph API logs as a file
     */
    public function downloadLogs(): Response
    {
        $contents = $this->logger->getLogContents();
        $filename = 'graph-api-' . date('Y-m-d-H-i-s') . '.log';

        return response($contents)
            ->header('Content-Type', 'text/plain; charset=utf-8')
            ->header('Content-Disposition', 'attachment; filename="' . $filename . '"');
    }

    /**
     * Clear today's logs
     */
    public function clearLogs(): JsonResponse
    {
        $logPath = $this->logger->getLogFilePath();

        if (File::exists($logPath)) {
            File::delete($logPath);
        }

        return response()->json([
            'message' => 'Logs cleared successfully',
            'log_path' => $logPath,
        ]);
    }
}
