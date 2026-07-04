<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ConnectedAccount;
use App\Models\Email;
use App\Models\EmailFolder;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * GET /api/admin/dashboard
     *
     * Returns aggregate stats for the admin overview cards and charts.
     */
    public function index(): JsonResponse
    {
        // Core counts
        $totalUsers       = User::count();
        $activeUsers      = User::where('is_active', true)->count();
        $adminUsers       = User::where('is_admin', true)->count();
        $newUsersToday    = User::whereDate('created_at', today())->count();
        $newUsersThisWeek = User::where('created_at', '>=', now()->startOfWeek())->count();

        $totalAccounts    = ConnectedAccount::count();
        $totalFolders     = EmailFolder::count();
        $totalEmails      = Email::count();
        $unreadEmails     = Email::where('is_read', false)->count();
        $emailsWithAttach = Email::where('has_attachments', true)->count();

        // Users registered per day for the last 30 days (for chart)
        $registrationTrend = User::select(
                DB::raw('DATE(created_at) as date'),
                DB::raw('COUNT(*) as count')
            )
            ->where('created_at', '>=', now()->subDays(29))
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->keyBy('date')
            ->map(fn ($r) => (int) $r->count);

        // Fill missing days with 0
        $trend = [];
        for ($i = 29; $i >= 0; $i--) {
            $day         = now()->subDays($i)->toDateString();
            $trend[$day] = $registrationTrend[$day] ?? 0;
        }

        // Accounts per user distribution (top 10 users by account count)
        $topUsers = ConnectedAccount::select('user_id', DB::raw('COUNT(*) as account_count'))
            ->with('user:id,name,email')
            ->groupBy('user_id')
            ->orderByDesc('account_count')
            ->limit(10)
            ->get()
            ->map(fn ($r) => [
                'user_id'       => $r->user_id,
                'name'          => $r->user?->name,
                'email'         => $r->user?->email,
                'account_count' => $r->account_count,
            ]);

        // Recent signups
        $recentUsers = User::orderByDesc('created_at')
            ->limit(5)
            ->get(['id', 'name', 'email', 'is_admin', 'is_active', 'created_at'])
            ->map(fn ($u) => [
                'id'         => $u->id,
                'name'       => $u->name,
                'email'      => $u->email,
                'is_admin'   => $u->is_admin,
                'is_active'  => $u->is_active,
                'created_at' => $u->created_at?->toISOString(),
            ]);

        return response()->json([
            'stats' => [
                'users' => [
                    'total'         => $totalUsers,
                    'active'        => $activeUsers,
                    'admins'        => $adminUsers,
                    'new_today'     => $newUsersToday,
                    'new_this_week' => $newUsersThisWeek,
                ],
                'accounts' => [
                    'total' => $totalAccounts,
                ],
                'emails' => [
                    'total'            => $totalEmails,
                    'unread'           => $unreadEmails,
                    'with_attachments' => $emailsWithAttach,
                    'folders'          => $totalFolders,
                ],
            ],
            'registration_trend' => $trend,
            'top_users'          => $topUsers,
            'recent_users'       => $recentUsers,
        ]);
    }
}
