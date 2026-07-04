<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ConnectedAccount;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class UserController extends Controller
{
    // =========================================================================
    // GET /api/admin/users?search=&page=1&per_page=20&filter=all|admin|inactive
    // =========================================================================
    public function index(Request $request): JsonResponse
    {
        $query   = User::withCount('connectedAccounts');
        $search  = $request->query('search', '');
        $filter  = $request->query('filter', 'all');
        $perPage = min((int) $request->query('per_page', 20), 500);

        if ($search !== '') {
            $query->where(fn ($q) =>
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
            );
        }

        match ($filter) {
            'admin'    => $query->where('is_admin', true),
            'inactive' => $query->where('is_active', false),
            default    => null,
        };

        $paginated = $query->orderByDesc('created_at')->paginate($perPage);

        return response()->json([
            'users'        => collect($paginated->items())->map(fn ($u) => $this->payload($u)),
            'total'        => $paginated->total(),
            'current_page' => $paginated->currentPage(),
            'last_page'    => $paginated->lastPage(),
            'per_page'     => $paginated->perPage(),
        ]);
    }

    // =========================================================================
    // GET /api/admin/users/{id}
    // =========================================================================
    public function show(int $id): JsonResponse
    {
        $user = User::withCount('connectedAccounts')->find($id);

        if ($user === null) {
            return $this->notFound();
        }

        $accounts = ConnectedAccount::where('user_id', $id)
            ->get(['id', 'email', 'display_name', 'is_primary', 'token_expires_at', 'created_at'])
            ->map(fn ($a) => [
                'id'               => $a->id,
                'email'            => $a->email,
                'display_name'     => $a->display_name,
                'is_primary'       => $a->is_primary,
                'token_expires_at' => $a->token_expires_at?->toISOString(),
                'created_at'       => $a->created_at?->toISOString(),
            ]);

        return response()->json([
            'user'     => $this->payload($user),
            'accounts' => $accounts,
        ]);
    }

    // =========================================================================
    // POST /api/admin/users  — create user directly (bypasses registration)
    // =========================================================================
    public function store(Request $request): JsonResponse
    {
        try {
            $data = $request->validate([
                'name'     => 'required|string|max:255',
                'email'    => 'required|email|max:255|unique:users,email',
                'password' => 'required|string|min:8',
                'is_admin' => 'boolean',
            ]);
        } catch (ValidationException $e) {
            return $this->validationError($e);
        }

        $user = User::create([
            'name'      => $data['name'],
            'email'     => $data['email'],
            'password'  => Hash::make($data['password']),
            'is_admin'  => $data['is_admin'] ?? false,
            'is_active' => true,
        ]);

        return response()->json(['user' => $this->payload($user)], 201);
    }

    // =========================================================================
    // PATCH /api/admin/users/{id}  — update name, email, password, is_admin, is_active
    // =========================================================================
    public function update(Request $request, int $id): JsonResponse
    {
        $user = User::find($id);
        if ($user === null) return $this->notFound();

        try {
            $data = $request->validate([
                'name'      => 'sometimes|string|max:255',
                'email'     => "sometimes|email|max:255|unique:users,email,{$id}",
                'password'  => 'sometimes|string|min:8',
                'is_admin'  => 'sometimes|boolean',
                'is_active' => 'sometimes|boolean',
            ]);
        } catch (ValidationException $e) {
            return $this->validationError($e);
        }

        // Prevent the last admin from losing admin status
        if (isset($data['is_admin']) && !$data['is_admin'] && $user->is_admin) {
            $adminCount = User::where('is_admin', true)->count();
            if ($adminCount <= 1) {
                return response()->json([
                    'error'   => 'last_admin',
                    'message' => 'Cannot remove admin from the last administrator account.',
                ], 422);
            }
        }

        if (isset($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        }

        $user->update($data);

        return response()->json(['user' => $this->payload($user->fresh())]);
    }

    // =========================================================================
    // DELETE /api/admin/users/{id}
    // =========================================================================
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = User::find($id);
        if ($user === null) return $this->notFound();

        // Prevent deleting yourself
        if ($user->id === (int) $request->input('auth_user_id')) {
            return response()->json([
                'error'   => 'self_delete',
                'message' => 'You cannot delete your own account.',
            ], 422);
        }

        // Prevent deleting the last admin
        if ($user->is_admin && User::where('is_admin', true)->count() <= 1) {
            return response()->json([
                'error'   => 'last_admin',
                'message' => 'Cannot delete the last administrator account.',
            ], 422);
        }

        $user->delete();

        return response()->json(['message' => 'User deleted successfully.']);
    }

    // =========================================================================
    // POST /api/admin/users/{id}/toggle-active
    // =========================================================================
    public function toggleActive(Request $request, int $id): JsonResponse
    {
        $user = User::find($id);
        if ($user === null) return $this->notFound();

        if ($user->id === (int) $request->input('auth_user_id')) {
            return response()->json([
                'error'   => 'self_disable',
                'message' => 'You cannot disable your own account.',
            ], 422);
        }

        $user->update(['is_active' => !$user->is_active]);

        return response()->json([
            'message'   => $user->is_active ? 'User activated.' : 'User deactivated.',
            'is_active' => $user->is_active,
        ]);
    }

    // =========================================================================
    // POST /api/admin/users/{id}/toggle-admin
    // =========================================================================
    public function toggleAdmin(int $id): JsonResponse
    {
        $user = User::find($id);
        if ($user === null) return $this->notFound();

        if ($user->is_admin && User::where('is_admin', true)->count() <= 1) {
            return response()->json([
                'error'   => 'last_admin',
                'message' => 'Cannot remove admin from the last administrator.',
            ], 422);
        }

        $user->update(['is_admin' => !$user->is_admin]);

        return response()->json([
            'message'  => $user->is_admin ? 'Admin granted.' : 'Admin revoked.',
            'is_admin' => $user->is_admin,
        ]);
    }

    // =========================================================================
    // DELETE /api/admin/users/{id}/accounts/{accountId}  — revoke linked account
    // =========================================================================
    public function destroyAccount(int $userId, int $accountId): JsonResponse
    {
        $account = ConnectedAccount::where('id', $accountId)
            ->where('user_id', $userId)
            ->first();

        if ($account === null) {
            return response()->json(['error' => 'not_found', 'message' => 'Account not found.'], 404);
        }

        $account->delete();

        return response()->json(['message' => 'Connected account removed.']);
    }

    // -------------------------------------------------------------------------

    private function payload(User $u): array
    {
        return [
            'id'                      => $u->id,
            'name'                    => $u->name,
            'email'                   => $u->email,
            'is_admin'                => (bool) $u->is_admin,
            'is_active'               => (bool) $u->is_active,
            'last_login_at'           => $u->last_login_at?->toISOString(),
            'connected_accounts_count'=> $u->connected_accounts_count ?? 0,
            'created_at'              => $u->created_at?->toISOString(),
        ];
    }

    private function notFound(): JsonResponse
    {
        return response()->json(['error' => 'not_found', 'message' => 'User not found.'], 404);
    }

    private function validationError(ValidationException $e): JsonResponse
    {
        return response()->json([
            'error'   => 'validation_failed',
            'message' => 'The given data was invalid.',
            'errors'  => $e->errors(),
        ], 422);
    }
}
