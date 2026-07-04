import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Users, Link2, Mail, MailOpen, ShieldCheck, UserCheck } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import toast from 'react-hot-toast'
import AdminLayout from '../components/layout/AdminLayout'
import StatCard from '../components/ui/StatCard'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import { getDashboard } from '../api/admin'

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DashboardPage() {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const location  = useLocation()
  const navigate  = useNavigate()

  // Safety net: catch any OAuth error/success params that landed here
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('account_added') === 'true') {
      toast.success('Microsoft account connected!')
      navigate('/accounts', { replace: true })
    } else if (params.get('oauth_error')) {
      toast.error('OAuth error: ' + decodeURIComponent(params.get('oauth_error')), { duration: 8000 })
      navigate('/dashboard', { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getDashboard()
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <AdminLayout title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <Spinner size={32} />
        </div>
      </AdminLayout>
    )
  }

  const { stats, registration_trend, top_users, recent_users } = data ?? {}

  const trendData = Object.entries(registration_trend ?? {}).map(([date, count]) => ({
    date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    users: count,
  }))

  return (
    <AdminLayout title="Dashboard">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Users"        value={stats?.users?.total}    icon={Users}      color="blue"   trend={stats?.users?.new_today} />
        <StatCard label="Active Users"       value={stats?.users?.active}   icon={UserCheck}  color="green"  sub={`${stats?.users?.admins} admin(s)`} />
        <StatCard label="Connected Accounts" value={stats?.accounts?.total} icon={Link2}      color="purple" />
        <StatCard label="Cached Emails"      value={stats?.emails?.total}   icon={Mail}       color="yellow" sub={`${stats?.emails?.unread} unread`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Registration trend chart */}
        <div className="lg:col-span-2 card">
          <p className="text-sm font-semibold text-white mb-4">User Registrations — Last 30 Days</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#0078D4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0078D4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#3a3a52" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
                interval={4} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
                allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#2a2a3d', border: '1px solid #3a3a52', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#e5e7eb' }}
                itemStyle={{ color: '#0078D4' }}
              />
              <Area type="monotone" dataKey="users" stroke="#0078D4" strokeWidth={2} fill="url(#grad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4">
          <StatCard label="Emails with Attachments" value={stats?.emails?.with_attachments} icon={MailOpen} color="blue" />
          <StatCard label="New This Week"            value={stats?.users?.new_this_week}     icon={Users}   color="green" />
          <StatCard label="Admin Users"              value={stats?.users?.admins}            icon={ShieldCheck} color="purple" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent signups */}
        <div className="card">
          <p className="text-sm font-semibold text-white mb-4">Recent Sign-ups</p>
          <div className="space-y-2">
            {(recent_users ?? []).map((u) => (
              <div key={u.id} className="flex items-center gap-3 py-2">
                <div className="w-8 h-8 rounded-full bg-brand/20 text-brand text-xs font-bold uppercase flex items-center justify-center flex-shrink-0">
                  {u.name?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{u.name}</p>
                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {u.is_admin  && <Badge color="purple">Admin</Badge>}
                  {!u.is_active && <Badge color="red">Disabled</Badge>}
                  <span className="text-xs text-gray-600">{fmt(u.created_at)}</span>
                </div>
              </div>
            ))}
            {!recent_users?.length && <p className="text-sm text-gray-600">No users yet.</p>}
          </div>
        </div>

        {/* Top users by account count */}
        <div className="card">
          <p className="text-sm font-semibold text-white mb-4">Most Connected Accounts</p>
          <div className="space-y-2">
            {(top_users ?? []).map((u) => (
              <div key={u.user_id} className="flex items-center gap-3 py-1.5">
                <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 text-xs font-bold uppercase flex items-center justify-center flex-shrink-0">
                  {u.name?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{u.name}</p>
                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                </div>
                <Badge color="blue">{u.account_count} account{u.account_count !== 1 ? 's' : ''}</Badge>
              </div>
            ))}
            {!top_users?.length && <p className="text-sm text-gray-600">No connected accounts yet.</p>}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
