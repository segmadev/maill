<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use UnexpectedValueException;

/**
 * Validates the JWT bearer token on every /api/* route.
 *
 * On success:  sets request->user_id and request->auth_user (User model).
 * On failure:  returns 401 JSON with a machine-readable error code.
 */
class JwtMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        \Log::debug("JWT Middleware: Processing request", [
            'method' => $request->getMethod(),
            'path' => $request->path(),
            'url' => $request->url(),
        ]);

        // Skip JWT validation for CORS preflight OPTIONS requests
        if ($request->getMethod() === 'OPTIONS') {
            \Log::debug("JWT Middleware: Skipping OPTIONS preflight request");
            return $next($request);
        }

        $token = $this->extractToken($request);

        if ($token === null) {
            \Log::warning("JWT Middleware: No token found in Authorization header", ['path' => $request->path()]);
            return $this->unauthorized('missing_token', 'No Authorization header provided.');
        }

        \Log::debug("JWT Middleware: Token extracted, length: " . strlen($token));

        try {
            $secret  = config('app.jwt_secret') ?? env('JWT_SECRET');
            $decoded = JWT::decode($token, new Key($secret, 'HS256'));
            \Log::debug("JWT Middleware: Token decoded successfully", ['sub' => $decoded->sub ?? null]);
        } catch (ExpiredException) {
            \Log::warning("JWT Middleware: Token expired");
            return $this->unauthorized('token_expired', 'Your session has expired. Please log in again.');
        } catch (UnexpectedValueException $e) {
            \Log::warning("JWT Middleware: Invalid token - " . $e->getMessage());
            return $this->unauthorized('invalid_token', 'The provided token is invalid.');
        }

        $user = User::find($decoded->sub ?? null);

        if ($user === null) {
            \Log::warning("JWT Middleware: User not found for sub", ['sub' => $decoded->sub ?? null]);
            return $this->unauthorized('user_not_found', 'Token references a user that no longer exists.');
        }

        \Log::debug("JWT Middleware: User authenticated", ['user_id' => $user->id, 'email' => $user->email]);

        // Attach user to the request so downstream controllers can read it.
        $request->merge(['auth_user_id' => $user->id]);
        $request->setUserResolver(fn () => $user);

        \Log::debug("JWT Middleware: auth_user_id set on request", ['auth_user_id' => $user->id]);

        return $next($request);
    }

    private function extractToken(Request $request): ?string
    {
        $header = $request->header('Authorization', '');

        if (str_starts_with($header, 'Bearer ')) {
            return substr($header, 7);
        }

        return null;
    }

    private function unauthorized(string $code, string $message): Response
    {
        return response()->json(['error' => $code, 'message' => $message], 401);
    }
}
