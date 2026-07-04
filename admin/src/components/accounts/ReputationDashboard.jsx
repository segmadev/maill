import { useEffect, useState } from 'react'
import { TrendingUp, AlertTriangle, AlertCircle, CheckCircle2, BarChart3, Calendar, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import Spinner from '../ui/Spinner'
import AccountInfoBadges from './AccountInfoBadges'
import {
  getSenderReputation,
  getWarmupStatus,
  getBounceReport,
  getComplaintReport,
  getSuppressionList,
} from '../../api/admin'

/**
 * Reputation Dashboard
 *
 * Shows comprehensive sender reputation metrics:
 * - Health score and rating
 * - Bounce/complaint rates
 * - Warmup progress
 * - Recent bounces and complaints
 * - Suppression list
 */
export default function ReputationDashboard({ accountId, account }) {
  const [loading, setLoading] = useState(true)
  const [reputation, setReputation] = useState(null)
  const [warmup, setWarmup] = useState(null)
  const [bounceReport, setBounceReport] = useState(null)
  const [complaintReport, setComplaintReport] = useState(null)
  const [suppressions, setSuppressions] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    if (accountId) {
      loadDashboard()
    }
  }, [accountId])

  const loadDashboard = async () => {
    setLoading(true)
    try {
      const [rep, warm, bounces, complaints, supp] = await Promise.all([
        getSenderReputation(accountId),
        getWarmupStatus(accountId),
        getBounceReport(accountId),
        getComplaintReport(accountId),
        getSuppressionList(accountId, 20),
      ])

      setReputation(rep)
      setWarmup(warm)
      setBounceReport(bounces)
      setComplaintReport(complaints)
      setSuppressions(supp)
    } catch (err) {
      toast.error('Failed to load reputation dashboard')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getHealthColor = (score) => {
    if (score >= 90) return { bg: 'bg-green-500/20', border: 'border-green-500/30', text: 'text-green-400' }
    if (score >= 70) return { bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', text: 'text-emerald-400' }
    if (score >= 50) return { bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', text: 'text-yellow-400' }
    if (score >= 30) return { bg: 'bg-orange-500/20', border: 'border-orange-500/30', text: 'text-orange-400' }
    return { bg: 'bg-red-500/20', border: 'border-red-500/30', text: 'text-red-400' }
  }

  const getWarmupStageColor = (stage) => {
    return ['', 'text-red-400', 'text-yellow-400', 'text-blue-400', 'text-green-400'][stage] || 'text-gray-400'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="sm" className="mr-3" />
        <span className="text-sm text-gray-400">Loading reputation data...</span>
      </div>
    )
  }

  if (!reputation || !warmup) {
    return <div className="text-gray-400 text-center py-8">Failed to load reputation data</div>
  }

  const healthColor = getHealthColor(reputation.reputation.health_score)

  return (
    <div className="space-y-6">
      {/* Account Info Badges */}
      {account && <AccountInfoBadges account={account} reputation={reputation} />}
      {/* Tabs */}
      <div className="flex gap-2 border-b border-surface-border">
        {[
          { id: 'overview', label: '📊 Overview' },
          { id: 'warmup', label: '🔥 Warmup' },
          { id: 'bounces', label: '📉 Bounces' },
          { id: 'complaints', label: '⚠️ Complaints' },
          { id: 'suppression', label: '🚫 Suppression' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-medium transition ${
              activeTab === tab.id
                ? 'text-white bg-white/10 border-b-2 border-brand'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Health Score Card */}
          <div className={`p-6 rounded-lg border-2 ${healthColor.bg} ${healthColor.border}`}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-gray-400 text-sm mb-2">Sender Health Score</p>
                <div className="flex items-baseline gap-3">
                  <span className={`text-5xl font-bold ${healthColor.text}`}>
                    {reputation.reputation.health_score}
                  </span>
                  <span className="text-gray-400">/100</span>
                </div>
              </div>
              <BarChart3 size={40} className={`${healthColor.text} opacity-50`} />
            </div>
            <p className={`text-lg font-semibold ${healthColor.text} capitalize`}>
              {reputation.reputation.status}
            </p>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-surface-raised rounded-lg border border-surface-border">
              <p className="text-gray-400 text-sm mb-2">Bounce Rate</p>
              <p className={`text-2xl font-bold ${reputation.bounce_stats.bounce_rate > 2 ? 'text-orange-400' : 'text-green-400'}`}>
                {reputation.bounce_stats.bounce_rate.toFixed(2)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {reputation.bounce_stats.bounce_rate > 5 && '🔴 Critical'}
                {reputation.bounce_stats.bounce_rate > 2 && reputation.bounce_stats.bounce_rate <= 5 && '🟠 Moderate'}
                {reputation.bounce_stats.bounce_rate <= 2 && '🟢 Good'}
              </p>
            </div>

            <div className="p-4 bg-surface-raised rounded-lg border border-surface-border">
              <p className="text-gray-400 text-sm mb-2">Complaint Rate</p>
              <p className={`text-2xl font-bold ${reputation.complaint_stats.complaint_rate > 0.1 ? 'text-orange-400' : 'text-green-400'}`}>
                {reputation.complaint_stats.complaint_rate.toFixed(4)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {reputation.complaint_stats.complaint_rate > 0.5 && '🔴 Critical'}
                {reputation.complaint_stats.complaint_rate > 0.1 && reputation.complaint_stats.complaint_rate <= 0.5 && '🟠 Elevated'}
                {reputation.complaint_stats.complaint_rate <= 0.1 && '🟢 Good'}
              </p>
            </div>

            <div className="p-4 bg-surface-raised rounded-lg border border-surface-border">
              <p className="text-gray-400 text-sm mb-2">Bounces (7d)</p>
              <p className="text-2xl font-bold text-white">
                {reputation.bounce_stats.total_bounces || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {reputation.bounce_stats.hard_bounces || 0} hard, {reputation.bounce_stats.soft_bounces || 0} soft
              </p>
            </div>
          </div>

          {/* Issues & Recommendations */}
          {reputation.reputation.issues && reputation.reputation.issues.length > 0 && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={20} className="text-red-400" />
                <h3 className="font-semibold text-red-300">Active Issues</h3>
              </div>
              <ul className="space-y-2 ml-6">
                {reputation.reputation.issues.map((issue, i) => (
                  <li key={i} className="text-sm text-red-300">• {issue}</li>
                ))}
              </ul>
            </div>
          )}

          {!reputation.reputation.issues || reputation.reputation.issues.length === 0 && (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-3">
              <CheckCircle2 size={20} className="text-green-400 flex-shrink-0" />
              <p className="text-green-300">✅ Sender reputation is healthy!</p>
            </div>
          )}
        </div>
      )}

      {/* Warmup Tab */}
      {activeTab === 'warmup' && warmup && (
        <div className="space-y-6">
          <div className={`p-6 rounded-lg border-2 border-surface-border bg-surface-raised/50`}>
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-gray-400 text-sm mb-2">Warmup Stage</p>
                <p className={`text-3xl font-bold ${getWarmupStageColor(warmup.warmup_status.stage)}`}>
                  {warmup.warmup_status.stage_description}
                </p>
              </div>
              <Zap size={40} className="text-yellow-400 opacity-50" />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-gray-400 text-sm mb-1">Days Sending</p>
                <p className="text-2xl font-bold text-white">{warmup.warmup_status.days_sending}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm mb-1">Next Stage In</p>
                <p className="text-2xl font-bold text-white">{warmup.warmup_status.next_stage_in_days} days</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <p className="text-sm text-gray-400">Daily Limit</p>
                  <p className="text-sm text-gray-300">{warmup.warmup_status.emails_sent_today}/{warmup.warmup_status.daily_limit}</p>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand transition-all"
                    style={{
                      width: `${Math.min(100, (warmup.warmup_status.emails_sent_today / warmup.warmup_status.daily_limit) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <p className="text-sm text-gray-400">Hourly Limit</p>
                  <p className="text-sm text-gray-300">{warmup.warmup_status.hourly_limit}/hour</p>
                </div>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          {warmup.warmup_status.recommendations && warmup.warmup_status.recommendations.length > 0 && (
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <h3 className="font-semibold text-blue-300 mb-3">📋 Warmup Recommendations</h3>
              <ul className="space-y-2">
                {warmup.warmup_status.recommendations.map((rec, i) => (
                  <li key={i} className="text-sm text-blue-300 flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">✓</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Bounces Tab */}
      {activeTab === 'bounces' && bounceReport && (
        <div className="space-y-6">
          <div className="p-4 bg-surface-raised rounded-lg border border-surface-border">
            <p className="text-gray-400 text-sm mb-2">Total Bounces (7 days)</p>
            <p className="text-3xl font-bold text-white">{bounceReport.bounce_report.total_bounces}</p>
          </div>

          {bounceReport.bounce_report.top_bounce_reasons && bounceReport.bounce_report.top_bounce_reasons.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-white">Top Bounce Reasons</h3>
              <div className="space-y-2">
                {bounceReport.bounce_report.top_bounce_reasons.map((reason, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-surface-raised rounded-lg border border-surface-border">
                    <span className="text-gray-300">{reason.reason || 'Unknown'}</span>
                    <span className="text-white font-semibold">{reason.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Complaints Tab */}
      {activeTab === 'complaints' && complaintReport && (
        <div className="space-y-6">
          <div className="p-4 bg-surface-raised rounded-lg border border-surface-border">
            <p className="text-gray-400 text-sm mb-2">Total Complaints (7 days)</p>
            <p className="text-3xl font-bold text-white">{complaintReport.complaint_report.total_complaints}</p>
          </div>

          {complaintReport.complaint_report.complaints_by_source && complaintReport.complaint_report.complaints_by_source.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-white">Complaints by Source</h3>
              <div className="space-y-2">
                {complaintReport.complaint_report.complaints_by_source.map((source, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-surface-raised rounded-lg border border-surface-border">
                    <span className="text-gray-300 capitalize">{source.complaint_source}</span>
                    <span className="text-white font-semibold">{source.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Suppression Tab */}
      {activeTab === 'suppression' && suppressions && (
        <div className="space-y-6">
          <div className="p-4 bg-surface-raised rounded-lg border border-surface-border">
            <p className="text-gray-400 text-sm mb-2">Total Suppressed Addresses</p>
            <p className="text-3xl font-bold text-white">{suppressions.suppression_list.total}</p>
          </div>

          {suppressions.suppression_list.suppressions && suppressions.suppression_list.suppressions.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-white">Recent Suppressions</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {suppressions.suppression_list.suppressions.map((supp, i) => (
                  <div key={i} className="p-3 bg-surface-raised rounded-lg border border-surface-border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-gray-300 font-mono text-sm">{supp.email}</span>
                      <span className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded">
                        {supp.reason}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {new Date(supp.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
