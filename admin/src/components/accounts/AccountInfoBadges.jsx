import { Lock, Zap, Calendar } from 'lucide-react'

/**
 * Account Info Badges
 * Displays connection type, health, and token status in a compact format
 */
export default function AccountInfoBadges({ account, reputation }) {
  const getTokenStatus = (token) => {
    if (!token) return { label: 'No token', color: 'text-gray-400' }
    const expiresAt = new Date(token.expires_at)
    const now = new Date()
    const daysLeft = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24))

    if (daysLeft < 0) return { label: 'Expired', color: 'text-red-400' }
    if (daysLeft === 0) return { label: 'Expires today', color: 'text-yellow-400' }
    if (daysLeft <= 7) return { label: `Expires in ${daysLeft}d`, color: 'text-yellow-400' }
    return { label: `${daysLeft}d left`, color: 'text-gray-400' }
  }

  const tokenStatus = getTokenStatus(account?.token)
  const refreshStatus = getTokenStatus(account?.refresh_token)
  const healthScore = reputation?.reputation?.health_score ?? '—'

  const getBadgeColor = (score) => {
    if (score >= 90) return 'text-green-400'
    if (score >= 70) return 'text-emerald-400'
    if (score >= 50) return 'text-yellow-400'
    if (score >= 30) return 'text-orange-400'
    return 'text-red-400'
  }

  return (
    <div className="grid grid-cols-4 gap-3 mb-4 text-xs">
      {/* Type Badge */}
      <div className="bg-surface rounded p-2 border border-surface-border/50">
        <p className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Type</p>
        <div className="flex items-center gap-1 text-white">
          <Lock size={12} />
          <span className="font-medium">{account?.connection_type === 'oauth_manual' ? 'OAuth (Admin)' : 'OAuth'}</span>
        </div>
      </div>

      {/* Health Badge */}
      <div className="bg-surface rounded p-2 border border-surface-border/50">
        <p className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Health</p>
        <div className="flex items-center gap-1">
          <span className={`font-medium ${getBadgeColor(healthScore)}`}>{healthScore >= 90 ? '✓' : ''} Excellent</span>
          {/* <span className="text-gray-500">({healthScore})</span> */}
        </div>
      </div>

      {/* Token Badge */}
      <div className="bg-surface rounded p-2 border border-surface-border/50">
        <p className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Token</p>
        <p className={`font-medium ${tokenStatus.color}`}>{tokenStatus.label}</p>
      </div>

      {/* Refresh Token Badge */}
      <div className="bg-surface rounded p-2 border border-surface-border/50">
        <p className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Refresh Token</p>
        <p className={`font-medium ${refreshStatus.color}`}>{refreshStatus.label}</p>
      </div>
    </div>
  )
}
