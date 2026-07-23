<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gates every /api/admin/* route.
 * Works with both:
 * - JWT: relies on auth_user_id being set on the request
 * - BFF OAuth: uses authenticated user from request->user()
 */
class AdminMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        // Try to get user from either BFF OAuth or JWT
        $user = $request->user();

        if ($user === null) {
            // Fallback to JWT auth_user_id
            $user = User::find($request->input('auth_user_id'));
        }

        if ($user === null || !$user->is_admin) {
            return response()->json([
                'error'   => 'forbidden',
                'message' => 'Administrator access required.',
            ], 403);
        }

        if (!$user->is_active) {
            return response()->json([
                'error'   => 'account_disabled',
                'message' => 'Your account has been disabled.',
            ], 403);
        }

        return $next($request);
    }
}
