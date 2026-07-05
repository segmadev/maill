import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle2, AlertTriangle, TrendingUp, Clock, BarChart3, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import { checkEmailHealth } from '../../api/admin'

/**
 * Email Health Check Modal
 *
 * Shows pre-send email health analysis with:
 * - Health score (0-100)
 * - Estimated inbox rate
 * - Critical issues that block sending
 * - Warnings to improve
 * - Warmup stage and rate limits
 * - Sender reputation metrics
 */
export default function EmailHealthCheckModal({
  open,
  onClose,
  onSend,
  accountId,
  subject,
  body,
  senderEmail,
  campaignSettings,
  recipients,
  signatureMode = 'dynamic',
  signatureId = null,
  includeSignature = true,
}) {
  const [loading, setLoading] = useState(false)
  const [healthReport, setHealthReport] = useState(null)
  const [error, setError] = useState(null)
  const [campaignSuggestions, setCampaignSuggestions] = useState([])

  useEffect(() => {
    if (open && accountId && subject && body) {
      checkHealth()
    }
  }, [open, accountId, subject, body])

  // Review campaign settings when health report is ready
  useEffect(() => {
    if (healthReport && campaignSettings) {
      reviewCampaignSettings()
    }
  }, [healthReport, campaignSettings, recipients])

  const checkHealth = async () => {
    setLoading(true)
    setError(null)
    try {
      let fullBody = body || ''

      // Include signature in body if enabled
      if (includeSignature && signatureMode === 'static' && signatureId) {
        try {
          const { getSignature } = await import('../../api/admin')
          const data = await getSignature(signatureId)
          if (data.signature?.html_content) {
            fullBody = fullBody + '\n\n' + data.signature.html_content
          }
        } catch (err) {
          console.error('Failed to fetch signature for health check:', err)
          // Continue with just the body if signature fetch fails
        }
      } else if (includeSignature && signatureMode === 'dynamic') {
        // For dynamic mode, add a note about signature inclusion for context
        fullBody = fullBody + '\n\n<!-- Each account will append its default signature -->'
      }

      const result = await checkEmailHealth({
        account_id: accountId,
        subject,
        body: fullBody,
        sender_email: senderEmail,
      })
      setHealthReport(result)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to check email health')
      toast.error('Health check failed')
    } finally {
      setLoading(false)
    }
  }

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-400'
    if (score >= 75) return 'text-emerald-400'
    if (score >= 60) return 'text-yellow-400'
    if (score >= 40) return 'text-orange-400'
    return 'text-red-400'
  }

  const getScoreBg = (score) => {
    if (score >= 90) return 'bg-green-500/20'
    if (score >= 75) return 'bg-emerald-500/20'
    if (score >= 60) return 'bg-yellow-500/20'
    if (score >= 40) return 'bg-orange-500/20'
    return 'bg-red-500/20'
  }

  const getScoreBorder = (score) => {
    if (score >= 90) return 'border-green-500/30'
    if (score >= 75) return 'border-emerald-500/30'
    if (score >= 60) return 'border-yellow-500/30'
    if (score >= 40) return 'border-orange-500/30'
    return 'border-red-500/30'
  }

  const getRatingText = (rating) => {
    return {
      excellent: '🟢 Excellent',
      good: '🟢 Good',
      fair: '🟡 Fair',
      poor: '🟠 Poor',
      critical: '🔴 Critical',
    }[rating] || rating
  }

  const formatDays = (days) => {
    if (!days || days < 0 || isNaN(days)) return 'Just started'
    if (days < 1) return 'Less than a day'
    return `${Math.round(days)} day${Math.round(days) !== 1 ? 's' : ''}`
  }

  const getIssueDescription = (message) => {
    if (message.includes('unsubscribe')) {
      return 'Add unsubscribe link in Settings → Email Compliance'
    }
    if (message.includes('physical address')) {
      return 'Add address in Settings → Email Compliance'
    }
    if (message.includes('SPF')) {
      return 'Configure SPF DNS record for your domain'
    }
    if (message.includes('DKIM')) {
      return 'Configure DKIM DNS record for your domain'
    }
    if (message.includes('DMARC')) {
      return 'Configure DMARC DNS record for your domain'
    }
    return ''
  }

  const reviewCampaignSettings = () => {
    const suggestions = []

    // Review emails per hour
    if (campaignSettings?.emailsPerHour) {
      if (campaignSettings.emailsPerHour < 20) {
        suggestions.push({
          type: 'info',
          message: `Emails per hour is low (${campaignSettings.emailsPerHour}/hr). Consider increasing to 50-100 for faster delivery.`
        })
      }
      if (campaignSettings.emailsPerHour > 500) {
        suggestions.push({
          type: 'warning',
          message: `Emails per hour is very high (${campaignSettings.emailsPerHour}/hr). This may hurt reputation. Recommended: 50-200/hr.`
        })
      }
    }

    // Review daily limit
    if (campaignSettings?.dailyLimit) {
      if (campaignSettings.dailyLimit < 100) {
        suggestions.push({
          type: 'info',
          message: `Daily limit is low (${campaignSettings.dailyLimit}). Consider increasing for larger campaigns.`
        })
      }
      if (campaignSettings.dailyLimit > 5000) {
        suggestions.push({
          type: 'warning',
          message: `Daily limit is very high (${campaignSettings.dailyLimit}). May impact sender reputation. Recommended: 500-2000/day.`
        })
      }
    }

    // Check email distribution
    if (recipients && recipients.length > 0) {
      const totalEmails = recipients.length
      const selectedAccounts = campaignSettings?.selectedAccounts || [accountId]
      const activeAccounts = selectedAccounts.filter(a => a !== null).length

      if (activeAccounts === 1 && totalEmails > 500) {
        suggestions.push({
          type: 'warning',
          message: `Sending ${totalEmails} emails from a single account. Consider distributing across 2-3 accounts to protect reputation.`
        })
      }

      if (activeAccounts > 1) {
        const perAccount = Math.ceil(totalEmails / activeAccounts)
        suggestions.push({
          type: 'info',
          message: `Distributing ~${perAccount} emails per account across ${activeAccounts} senders.`
        })
      }
    }

    // Check IP warmup
    if (!campaignSettings?.enableIpWarmup && recipients?.length > 1000) {
      suggestions.push({
        type: 'warning',
        message: `Large campaign (${recipients.length} emails) without IP warmup. Enable warmup to gradually increase reputation.`
      })
    }

    setCampaignSuggestions(suggestions)
  }

  return (
    <Modal open={open} onClose={onClose} title="📊 Email Health Check" size="lg">
      <div className="space-y-6">
        {loading && (
          <div className="flex flex-col items-center justify-center py-6">
            <Spinner size={24} className="mb-2" />
            <p className="text-gray-400 text-sm">Analyzing your email...</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {!loading && healthReport && (
          <>
            {/* Health Score - Compact */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-surface-border bg-surface-raised/50">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Health Score</p>
                <div className="flex items-baseline gap-1">
                  <span className={`text-3xl font-bold ${getScoreColor(healthReport.health.score)}`}>
                    {healthReport.health.score}
                  </span>
                  <span className="text-xs text-gray-500">/100 • {healthReport.health.estimated_inbox_rate}% inbox</span>
                </div>
              </div>
              <div className="text-right text-xs">
                <p className={`${getScoreColor(healthReport.health.score)} font-semibold`}>
                  {getRatingText(healthReport.health.rating)}
                </p>
              </div>
            </div>

            {/* Issues & Warnings - Compact */}
            {((healthReport.health.issues && healthReport.health.issues.length > 0) ||
              (healthReport.health.warnings && healthReport.health.warnings.length > 0)) && (
              <div className="space-y-2">
                {healthReport.health.issues && healthReport.health.issues.length > 0 && (
                  <div className="p-2.5 bg-red-500/15 border border-red-500/30 rounded text-xs">
                    <p className="text-red-300 font-medium">❌ {healthReport.health.issues.length} critical issue{healthReport.health.issues.length !== 1 ? 's' : ''}</p>
                    {healthReport.health.issues.map((issue, i) => (
                      <p key={i} className="text-red-200 text-[11px] mt-0.5">{issue.message}</p>
                    ))}
                  </div>
                )}
                {healthReport.health.warnings && healthReport.health.warnings.length > 0 && (
                  <div className="p-2.5 bg-yellow-500/15 border border-yellow-500/30 rounded text-xs">
                    <p className="text-yellow-300 font-medium">⚠️ {healthReport.health.warnings.length} warning{healthReport.health.warnings.length !== 1 ? 's' : ''}</p>
                    {healthReport.health.warnings.map((warning, i) => (
                      <p key={i} className="text-yellow-200 text-[11px] mt-0.5">{warning.message}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Campaign Suggestions - Compact */}
            {campaignSuggestions && campaignSuggestions.length > 0 && (
              <div className="p-2.5 bg-blue-500/15 border border-blue-500/30 rounded text-xs space-y-1">
                <p className="text-blue-300 font-medium">💡 Campaign suggestions</p>
                {campaignSuggestions.map((sug, i) => (
                  <p key={i} className={`text-[11px] ${sug.type === 'warning' ? 'text-yellow-300' : 'text-blue-200'}`}>
                    {sug.message}
                  </p>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div className={`flex gap-3 pt-4 border-t border-surface-border ${healthReport.health.issues.length > 0 ? 'flex-col' : ''}`}>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-surface-raised hover:bg-surface-raised/80 text-gray-300 rounded-lg font-medium transition"
              >
                Cancel
              </button>
              {healthReport.health.issues.length === 0 ? (
                <button
                  onClick={() => {
                    onClose()
                    onSend()
                  }}
                  className="flex-1 px-4 py-2.5 bg-brand hover:bg-brand/90 text-white rounded-lg font-medium transition"
                >
                  ✅ Send Email
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      onClose()
                      onSend()
                    }}
                    className="flex-1 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition"
                    title="Send email anyway, ignoring critical issues"
                  >
                    ⚠️ Send Anyway
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
