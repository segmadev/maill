<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

/*
|--------------------------------------------------------------------------
| Console Routes
|--------------------------------------------------------------------------
| The schedule is defined in bootstrap/app.php via ->withSchedule().
| To run the scheduler: php artisan schedule:work
| Cron (every minute):  * * * * * cd /path && php artisan schedule:run >> /dev/null 2>&1
|--------------------------------------------------------------------------
*/

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');
