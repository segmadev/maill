import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Mail, Inbox, Link2, Settings,
  LogOut, Send, ChevronLeft, ChevronRight, UserCircle, Zap, FileText, Sliders,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

const links = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/inbox',     icon: Inbox,           label: 'My Inbox' },
  { to: '/users',     icon: Users,           label: 'Users' },
  { to: '/accounts',  icon: Link2,           label: 'Connected Accounts' },
  { to: '/bulk-send', icon: Send,            label: 'Bulk Email Campaigns' },
  { to: '/mails',     icon: Mail,            label: 'All Emails' },
  { to: '/signatures', icon: FileText,       label: 'Email Signatures' },
  { to: '/rules',     icon: Sliders,         label: 'Outlook Rules' },
  { to: '/settings',  icon: Settings,        label: 'Settings' },
]

export default function Sidebar({ collapsed, onToggle }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  return (
    <aside
      className={`fixed inset-y-0 left-0 bg-surface border-r border-surface-border flex flex-col z-30
        transition-[width] duration-200 overflow-hidden
        ${collapsed ? 'w-14' : 'w-60'}`}
    >
      {/* ── Logo ──────────────────────────────────────────────────────────── */}
      <div
        className={`flex items-center border-b border-surface-border flex-shrink-0
          ${collapsed ? 'justify-center px-0 h-[69px]' : 'gap-3 px-5 py-5'}`}
      >
        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
          <Zap size={16} className="text-black" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-white leading-none">Mail & Sender</p>
            <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider font-medium">Admin</p>
          </div>
        )}
      </div>

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center rounded-sm text-sm font-medium transition-all
              ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'}
              ${isActive
                ? 'bg-white/10 text-white font-semibold'
                : 'text-gray-500 hover:text-white'
              }`
            }
          >
            <Icon size={17} className="flex-shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* ── User footer ───────────────────────────────────────────────────── */}
      <div className="px-2 py-3 border-t border-surface-border flex-shrink-0">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => navigate('/profile')}
              title={`${user?.name} — My Profile`}
              className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-black text-xs font-bold uppercase hover:ring-2 hover:ring-white/40 transition-all"
            >
              {user?.name?.[0] ?? 'A'}
            </button>
            <button
              onClick={logout}
              title="Sign out"
              className="p-1 rounded hover:bg-surface-raised text-gray-500 hover:text-red-400 transition-colors"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-1 py-1 rounded-lg group">
            <button
              onClick={() => navigate('/profile')}
              title="My Profile"
              className="flex items-center gap-2.5 flex-1 min-w-0 rounded-lg hover:bg-surface-raised px-1 py-0.5 transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-black text-xs font-bold uppercase flex-shrink-0">
                {user?.name?.[0] ?? 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{user?.name}</p>
                <p className="text-[10px] text-gray-500 truncate">{user?.email}</p>
              </div>
              <UserCircle size={12} className="text-gray-600 group-hover:text-brand transition-colors flex-shrink-0" />
            </button>
            <button
              onClick={logout}
              title="Sign out"
              className="p-1 rounded hover:bg-surface text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Collapse toggle (floating pill on right edge) ──────────────────── */}
      <button
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-[4.25rem] w-6 h-6 rounded-full
          bg-surface-raised border border-surface-border
          flex items-center justify-center
          text-gray-400 hover:text-white hover:bg-brand hover:border-brand
          transition-colors z-40 shadow-md"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  )
}
