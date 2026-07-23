<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Handles authentication for API routes
 * Supports both JWT (old) and BFF OAuth (new)
 */
class ApiAuthMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        // Try BFF OAuth first (new system)
        if ($request->cookie('oauth_session')) {
            return app(OAuthSessionMiddleware::class)->handle($request, $next);
        }

        // Fall back to JWT (old system)
        if ($request->hasHeader('Authorization')) {
            return app(\App\Http\Middleware\JwtMiddleware::class)->handle($request, $next);
        }

        return response()->json(['error' => 'unauthorized', 'message' => 'No authentication provided'], 401);
    }
}
