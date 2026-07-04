import { Mail, LogOut, Clock, Sparkles } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'

function fmt(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function UserHomePage() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/user/login', { replace: true })
  }

  const initials = (user?.name ?? '?')
    .split(' ')
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="min-h-screen bg-[#0f0f1a] flex flex-col">

      {/* Top bar */}
      <header className="border-b border-[#2a2a42] bg-[#1a1a2e] px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand/20 border border-brand/30 flex items-center justify-center">
            <Mail size={13} className="text-brand" />
          </div>
          <span className="text-sm font-semibold text-white">MailHub</span>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10"
        >
          <LogOut size={12} />
          Sign out
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">

        {/* Avatar */}
        <div className="w-20 h-20 rounded-full bg-brand/20 border-2 border-brand/30 flex items-center justify-center mb-5">
          <span className="text-2xl font-bold text-brand">{initials}</span>
        </div>

        {/* Welcome */}
        <h1 className="text-2xl font-bold text-white mb-1">
          Welcome back, {user?.name?.split(' ')[0] ?? 'there'}!
        </h1>
        <p className="text-sm text-gray-500 mb-2">{user?.email}</p>

        {user?.last_login_at && (
          <p className="flex items-center gap-1.5 text-[11px] text-gray-600 mb-10">
            <Clock size={11} />
            Last sign-in: {fmt(user.last_login_at)}
          </p>
        )}

        {/* Coming-soon card */}
        <div className="w-full max-w-md bg-[#1a1a2e] border border-[#2a2a42] rounded-2xl px-8 py-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto mb-4">
            <Sparkles size={22} className="text-brand" />
          </div>
          <h2 className="text-base font-semibold text-white mb-2">More features coming soon</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Your account is set up and ready to go. Full access to your mailbox
            and additional tools will be available in the next release.
          </p>
        </div>

        {/* Account info strip */}
        <div className="mt-8 flex items-center gap-6 text-[11px] text-gray-600">
          <span>Account created {fmt(user?.created_at)?.split(',')[0]}</span>
          <span className="w-px h-3 bg-[#2a2a42]" />
          <span className={user?.is_active ? 'text-green-500' : 'text-red-400'}>
            {user?.is_active ? '● Active' : '● Disabled'}
          </span>
        </div>

      </main>
    </div>
  )
}
