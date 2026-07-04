<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gates every /api/admin/* route.
 * Must run AFTER JwtMiddleware (relies on auth_user_id being set on the request).
 */
class AdminMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = User::find($request->input('auth_user_id'));

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
