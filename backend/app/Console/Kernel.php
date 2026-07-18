<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * Define the application's command schedule.
     */
    protected function schedule(Schedule $schedule): void
    {
        // Clear log files larger than 50MB every hour
        $schedule->command('logs:clear-large --size=50')
            ->hourly()
            ->withoutOverlapping()
            ->onFailure(function () {
                \Log::warning('Log cleanup command failed to complete');
            });

        // Alternative: Run the token renewal cron job every 5 minutes
        // (if using Laravel scheduler instead of external cron)
        // $schedule->call(function () {
        //     $service = app(\App\Services\TokenRenewalService::class);
        //     $service->renewTokensBatch();
        // })->everyFiveMinutes();
    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__ . '/Commands');

        require base_path('routes/console.php');
    }
}
