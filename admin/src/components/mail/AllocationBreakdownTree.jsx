import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Mail, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import client from '../../api/client'
import Spinner from '../ui/Spinner'

export default function AllocationBreakdownTree({ campaignId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedAccounts, setExpandedAccounts] = useState(new Set())
  const [expandedRecipients, setExpandedRecipients] = useState(new Set())

  useEffect(() => {
    const fetchBreakdown = async () => {
      try {
        setLoading(true)
        const response = await client.get(`/bulk-email-campaigns/${campaignId}/allocation-breakdown`)
        setData(response.data)
      } catch (err) {
        setError(err.message || 'Failed to load allocation breakdown')
      } finally {
        setLoading(false)
      }
    }

    if (campaignId) {
      fetchBreakdown()
    }
  }, [campaignId])

  if (loading) return <Spinner size={24} />
  if (error) return <div className="text-red-400 text-sm">{error}</div>
  if (!data) return null

  const toggleAccount = (accountId) => {
    const newSet = new Set(expandedAccounts)
    newSet.has(accountId) ? newSet.delete(accountId) : newSet.add(accountId)
    setExpandedAccounts(newSet)
  }

  const toggleRecipient = (recipientKey) => {
    const newSet = new Set(expandedRecipients)
    newSet.has(recipientKey) ? newSet.delete(recipientKey) : newSet.add(recipientKey)
    setExpandedRecipients(newSet)
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'sent':
        return <CheckCircle2 size={14} className="text-green-400" />
      case 'pending':
        return <Clock size={14} className="text-yellow-400" />
      case 'failed':
      case 'bounced':
      case 'retrying':
        return <AlertCircle size={14} className="text-red-400" />
      default:
        return null
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'sent':
        return 'text-green-400'
      case 'pending':
        return 'text-yellow-400'
      case 'failed':
      case 'bounced':
      case 'retrying':
        return 'text-red-400'
      default:
        return 'text-gray-400'
    }
  }

  return (
    <div className="space-y-3 bg-surface rounded-lg p-4 border border-surface-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <Mail size={18} />
          Recipient Distribution
        </h3>
        <span className="text-xs text-gray-500">
          {data.distribution_strategy} distribution • {data.total_recipients} recipients
        </span>
      </div>

      <div className="space-y-2">
        {data.breakdown.map((accountBreakdown) => {
          const isExpanded = expandedAccounts.has(accountBreakdown.account_id)
          const sentPct = accountBreakdown.total_count > 0
            ? Math.round((accountBreakdown.sent_count / accountBreakdown.total_count) * 100)
            : 0

          return (
            <div key={accountBreakdown.account_id} className="border border-surface-border rounded-lg overflow-hidden">
              {/* Account Row */}
              <button
                onClick={() => toggleAccount(accountBreakdown.account_id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-surface-raised transition-colors text-left"
              >
                <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                  {isExpanded ? (
                    <ChevronDown size={16} className="text-gray-500" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-white truncate">{accountBreakdown.account_email}</span>
                    <span className="text-xs text-gray-500">
                      {accountBreakdown.account_name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">Total:</span>
                      <span className="text-white font-medium">{accountBreakdown.total_count}</span>
                    </div>
                    <span className="text-gray-600">•</span>
                    <div className="flex items-center gap-1">
                      <CheckCircle2 size={12} className="text-green-400" />
                      <span className="text-green-400">{accountBreakdown.sent_count}</span>
                    </div>
                    <span className="text-gray-600">•</span>
                    <div className="flex items-center gap-1">
                      <Clock size={12} className="text-yellow-400" />
                      <span className="text-yellow-400">{accountBreakdown.pending_count}</span>
                    </div>
                    {accountBreakdown.failed_count > 0 && (
                      <>
                        <span className="text-gray-600">•</span>
                        <div className="flex items-center gap-1">
                          <AlertCircle size={12} className="text-red-400" />
                          <span className="text-red-400">{accountBreakdown.failed_count}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="flex-shrink-0 w-24 h-1 bg-surface-border rounded-full overflow-hidden ml-2">
                  <div
                    className="h-full bg-green-500/60 transition-all"
                    style={{ width: `${sentPct}%` }}
                  />
                </div>
              </button>

              {/* Recipients List */}
              {isExpanded && (
                <div className="border-t border-surface-border bg-surface-raised px-3 py-2 space-y-1">
                  {accountBreakdown.recipients.length === 0 ? (
                    <p className="text-xs text-gray-600 py-1">No recipients assigned</p>
                  ) : (
                    accountBreakdown.recipients.map((recipient, idx) => {
                      const recipientKey = `${accountBreakdown.account_id}-${recipient.email}`
                      const isRecipientExpanded = expandedRecipients.has(recipientKey)
                      const hasError = recipient.error_message

                      return (
                        <div key={idx} className="bg-surface rounded border border-surface-border/50 overflow-hidden">
                          <button
                            onClick={() => hasError && toggleRecipient(recipientKey)}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-surface-raised transition-colors text-left text-xs"
                            disabled={!hasError}
                          >
                            {hasError ? (
                              <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                                {isRecipientExpanded ? (
                                  <ChevronDown size={12} className="text-gray-600" />
                                ) : (
                                  <ChevronRight size={12} className="text-gray-600" />
                                )}
                              </div>
                            ) : (
                              <div className="flex-shrink-0 w-4" />
                            )}

                            <div className="flex-shrink-0">
                              {getStatusIcon(recipient.status)}
                            </div>

                            <span className="flex-1 text-gray-300 truncate">{recipient.email}</span>

                            {recipient.name && (
                              <span className="text-gray-600 truncate max-w-[150px]">({recipient.name})</span>
                            )}

                            <span className={`text-xs font-medium flex-shrink-0 ${getStatusColor(recipient.status)}`}>
                              {recipient.status}
                            </span>

                            {recipient.sent_at && (
                              <span className="text-gray-700 text-[10px] flex-shrink-0">
                                {new Date(recipient.sent_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            )}
                          </button>

                          {/* Error Details */}
                          {hasError && isRecipientExpanded && (
                            <div className="border-t border-surface-border/50 bg-red-500/5 px-2.5 py-1.5">
                              <p className="text-[10px] text-red-300 break-words">
                                {recipient.error_message}
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
