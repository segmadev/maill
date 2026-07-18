<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class ClearLargeLogFiles extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'logs:clear-large {--size=50 : Size in MB above which to clear logs}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Clear log files when they exceed a specified size (default 50MB)';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $maxSizeMB = (int) $this->option('size');
        $maxSizeBytes = $maxSizeMB * 1024 * 1024;

        $logPath = storage_path('logs');

        if (!is_dir($logPath)) {
            $this->error("Log directory not found: $logPath");
            return 1;
        }

        $clearedCount = 0;
        $totalFreed = 0;

        // Find all log files
        $files = glob($logPath . '/*.log');

        if (empty($files)) {
            $this->info('No log files found.');
            return 0;
        }

        foreach ($files as $file) {
            $fileSize = filesize($file);

            if ($fileSize > $maxSizeBytes) {
                $fileSizeMB = round($fileSize / (1024 * 1024), 2);

                try {
                    // Clear the file by truncating it
                    file_put_contents($file, '');

                    $this->line("✓ Cleared <info>{$file}</info> (was {$fileSizeMB}MB)");

                    $clearedCount++;
                    $totalFreed += $fileSize;

                    // Log this action
                    Log::warning("Log file cleared: $file (was {$fileSizeMB}MB)");
                } catch (\Exception $e) {
                    $this->error("Failed to clear $file: " . $e->getMessage());
                }
            }
        }

        if ($clearedCount === 0) {
            $this->info("All log files are below {$maxSizeMB}MB threshold.");
            return 0;
        }

        $totalFreedMB = round($totalFreed / (1024 * 1024), 2);
        $this->info("✓ Cleared $clearedCount log file(s) | Freed: {$totalFreedMB}MB");

        return 0;
    }
}
