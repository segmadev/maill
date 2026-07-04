import { Lock, Mail } from 'lucide-react'

export default function ConnectionBadge({ type }) {
  const badges = {
    oauth: {
      icon: Lock,
      label: 'OAuth',
      color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    },
    oauth_manual: {
      icon: Lock,
      label: 'OAuth (Admin)',
      color: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    },
    smtp: {
      icon: Mail,
      label: 'SMTP/IMAP',
      color: 'bg-green-500/20 text-green-300 border-green-500/30',
    },
  }

  const badge = badges[type] || badges.oauth
  const Icon = badge.icon

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${badge.color}`}>
      <Icon size={12} />
      {badge.label}
    </div>
  )
}
