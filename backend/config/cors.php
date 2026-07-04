<?php

$defaultOrigins = [
    'http://localhost:5173',
    'http://localhost:7100',   // admin panel
    'http://localhost:7101',   // admin panel
    'http://localhost:7102',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:7100',  // admin panel
    'http://127.0.0.1:7101',  // admin panel
    'http://127.0.0.1:7102',
];

$frontendUrls = env('FRONTEND_URLS');
if ($frontendUrls === null) {
    $frontendUrls = env('FRONTEND_URL');
}

return [

    /*
    |--------------------------------------------------------------------------
    | CORS configuration
    |--------------------------------------------------------------------------
    | Only allow requests from the frontend origin.
    | For local dev both the Vite dev server (5173) and any proxy are allowed.
    | Change 'allowed_origins' to your production domain before deploying.
    */

    'paths' => ['api/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $frontendUrls
        ? array_values(array_filter(array_map('trim', explode(',', $frontendUrls))))
        : $defaultOrigins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    // Cookies/sessions are needed for the OAuth state value during the
    // callback flow, so credentials must be allowed.
    'supports_credentials' => true,

];
