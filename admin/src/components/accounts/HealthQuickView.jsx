import { useEffect, useState } from 'react'
import { AlertCircle, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { getSenderReputation } from '../../api/admin'

/**
 * Quick Health Indicator for Accounts Table
 * Shows a badge with health status and bounce/complaint rates
 */
export default function HealthQuickView({ accountId, onClick }) {
  const [reputation, setReputation] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!accountId) return

    const loadReputation = async () => {
      try {
        const data = await getSenderReputation(accountId)
        setReputation(data)
      } catch (err) {
        // Silently fail - not critical
      } finally {
        setLoading(false)
      }
    }

    loadReputation()
  }, [accountId])

  const getHealthBadge = (score) => {
    if (score >= 90) return { bg: 'bg-green-500/20', text: 'text-green-400', label: '✓ Excellent' }
    if (score >= 70) return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: '✓ Good' }
    if (score >= 50) return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: '⚠ Fair' }
    if (score >= 30) return { bg: 'bg-orange-500/20', text: 'text-orange-400', label: '⚠ Poor' }
    return { bg: 'bg-red-500/20', text: 'text-red-400', label: '❌ Critical' }
  }

  if (loading) return <span className="text-xs text-gray-500">—</span>

  if (!reputation || !reputation.reputation) {
    return <span className="text-xs text-gray-500">No data</span>
  }

  const score = reputation.reputation.health_score
  const bounce = reputation.bounce_stats.bounce_rate
  const complaint = reputation.complaint_stats.complaint_rate
  const badge = getHealthBadge(score)

  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded text-xs font-medium transition ${badge.bg} ${badge.text} hover:opacity-80 cursor-pointer`}
      title={`Health: ${score}/100 | Bounces: ${bounce}% | Complaints: ${complaint}%`}
    >
      <div className="flex items-center gap-1">
        <span>{badge.label}</span>
        <span className="text-xs opacity-70">({score})</span>
      </div>
    </button>
  )
}
