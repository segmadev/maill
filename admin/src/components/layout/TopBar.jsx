import { Menu, Bell } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

export default function TopBar({ title, onToggle }) {
  const { user } = useAuthStore()

  return (
    <header className="h-14 bg-surface border-b border-surface-border flex items-center gap-3 px-4 flex-shrink-0">
      {/* Hamburger — secondary toggle for keyboard / touch users */}
      <button
        onClick={onToggle}
        title="Toggle sidebar"
        className="p-1.5 rounded-lg hover:bg-surface-raised text-gray-400 hover:text-white transition-colors flex-shrink-0"
      >
        <Menu size={16} />
      </button>

      <h1 className="text-sm font-semibold text-white flex-1 min-w-0 truncate">{title}</h1>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button className="p-1.5 rounded-lg hover:bg-surface-raised text-gray-400 hover:text-white transition-colors">
          <Bell size={16} />
        </button>
        <div
          className="w-7 h-7 rounded-full bg-brand/20 flex items-center justify-center text-brand text-xs font-bold uppercase"
          title={user?.email}
        >
          {user?.name?.[0] ?? 'A'}
        </div>
      </div>
    </header>
  )
}
