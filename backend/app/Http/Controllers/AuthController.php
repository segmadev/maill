<?php

namespace App\Http\Controllers;

use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    // -------------------------------------------------------------------------
    // POST /api/auth/register
    // -------------------------------------------------------------------------
    public function register(Request $request): JsonResponse
    {
        try {
            $data = $request->validate([
                'name'     => 'required|string|max:255',
                'email'    => 'required|email|max:255|unique:users,email',
                'password' => 'required|string|min:8|confirmed',
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'error'   => 'validation_failed',
                'message' => 'The given data was invalid.',
                'errors'  => $e->errors(),
            ], 422);
        }

        $user = User::create([
            'name'     => $data['name'],
            'email'    => $data['email'],
            'password' => Hash::make($data['password']),
        ]);

        return response()->json([
            'user'  => $this->userPayload($user),
            'token' => $this->generateJwt($user),
        ], 201);
    }

    // -------------------------------------------------------------------------
    // POST /api/auth/login
    // -------------------------------------------------------------------------
    public function login(Request $request): JsonResponse
    {
        try {
            $data = $request->validate([
                'email'    => 'required|email',
                'password' => 'required|string',
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'error'   => 'validation_failed',
                'message' => 'The given data was invalid.',
                'errors'  => $e->errors(),
            ], 422);
        }

        $user = User::where('email', $data['email'])->first();

        if ($user === null || !Hash::check($data['password'], $user->password)) {
            return response()->json([
                'error'   => 'invalid_credentials',
                'message' => 'Email or password is incorrect.',
            ], 401);
        }

        if (!$user->is_active) {
            return response()->json([
                'error'   => 'account_disabled',
                'message' => 'Your account has been disabled. Contact an administrator.',
            ], 403);
        }

        $user->update(['last_login_at' => now()]);

        return response()->json([
            'user'  => $this->userPayload($user),
            'token' => $this->generateJwt($user),
        ]);
    }

    // -------------------------------------------------------------------------
    // GET /api/auth/me  (protected by JwtMiddleware)
    // -------------------------------------------------------------------------
    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userPayload($request->user())]);
    }

    // -------------------------------------------------------------------------
    // PATCH /api/auth/profile  — update name and/or password
    // -------------------------------------------------------------------------
    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        try {
            $data = $request->validate([
                'name'                      => 'sometimes|string|max:255',
                'current_password'          => 'required_with:new_password|string',
                'new_password'              => 'sometimes|string|min:8|confirmed',
                'new_password_confirmation' => 'sometimes|string',
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'error'   => 'validation_failed',
                'message' => 'The given data was invalid.',
                'errors'  => $e->errors(),
            ], 422);
        }

        if (isset($data['new_password'])) {
            if (! Hash::check($data['current_password'], $user->password)) {
                return response()->json([
                    'error'   => 'invalid_password',
                    'message' => 'Current password is incorrect.',
                ], 422);
            }
            $user->password = Hash::make($data['new_password']);
        }

        if (isset($data['name']) && trim($data['name'])) {
            $user->name = trim($data['name']);
        }

        $user->save();

        return response()->json([
            'message' => 'Profile updated successfully.',
            'user'    => $this->userPayload($user),
        ]);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function generateJwt(User $user): string
    {
        $secret  = config('app.jwt_secret') ?? env('JWT_SECRET');
        $ttl     = (int) (config('app.jwt_ttl_minutes') ?? env('JWT_TTL_MINUTES', 1440));
        $now     = time();

        $payload = [
            'iss' => config('app.url'),
            'iat' => $now,
            'exp' => $now + ($ttl * 60),
            'sub' => $user->id,
        ];

        return JWT::encode($payload, $secret, 'HS256');
    }

    private function userPayload(User $user): array
    {
        return [
            'id'            => $user->id,
            'name'          => $user->name,
            'email'         => $user->email,
            'is_admin'      => (bool) $user->is_admin,
            'is_active'     => (bool) $user->is_active,
            'last_login_at' => $user->last_login_at?->toISOString(),
            'created_at'    => $user->created_at?->toISOString(),
        ];
    }
}
