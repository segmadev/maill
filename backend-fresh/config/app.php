<?php

use Illuminate\Support\Facades\Facade;

return [

    'name'  => env('APP_NAME', 'Mail Manager'),
    'env'   => env('APP_ENV', 'production'),
    'debug' => (bool) env('APP_DEBUG', false),
    'url'   => env('APP_URL', 'http://localhost'),

    'frontend_url' => env('FRONTEND_URL', 'http://localhost:5173'),

    'timezone' => 'UTC',
    'locale'   => 'en',
    'key'      => env('APP_KEY'),
    'cipher'   => 'AES-256-CBC',

    // JWT settings (read by AuthController and JwtMiddleware)
    'jwt_secret'      => env('JWT_SECRET'),
    'jwt_ttl_minutes' => (int) env('JWT_TTL_MINUTES', 1440),

    // Token encryption key (read by TokenEncryptionService)
    'token_encryption_key' => env('TOKEN_ENCRYPTION_KEY'),

    'providers' => [
        Illuminate\Auth\AuthServiceProvider::class,
        Illuminate\Broadcasting\BroadcastServiceProvider::class,
        Illuminate\Bus\BusServiceProvider::class,
        Illuminate\Cache\CacheServiceProvider::class,
        Illuminate\Foundation\Providers\ConsoleSupportServiceProvider::class,
        Illuminate\Cookie\CookieServiceProvider::class,
        Illuminate\Database\DatabaseServiceProvider::class,
        Illuminate\Encryption\EncryptionServiceProvider::class,
        Illuminate\Filesystem\FilesystemServiceProvider::class,
        Illuminate\Foundation\Providers\FoundationServiceProvider::class,
        Illuminate\Hashing\HashServiceProvider::class,
        Illuminate\Mail\MailServiceProvider::class,
        Illuminate\Notifications\NotificationServiceProvider::class,
        Illuminate\Pagination\PaginationServiceProvider::class,
        Illuminate\Pipeline\PipelineServiceProvider::class,
        Illuminate\Queue\QueueServiceProvider::class,
        Illuminate\Redis\RedisServiceProvider::class,
        Illuminate\Auth\Passwords\PasswordResetServiceProvider::class,
        Illuminate\Session\SessionServiceProvider::class,
        Illuminate\Translation\TranslationServiceProvider::class,
        Illuminate\Validation\ValidationServiceProvider::class,
        Illuminate\View\ViewServiceProvider::class,
    ],

    'aliases' => Facade::defaultAliases()->merge([
        // Add project-level aliases here.
    ])->toArray(),

];
