/**
 * CampaignDetailsModal
 *
 * Shows detailed information about a campaign:
 * - Email content (subject, body preview)
 * - Account distribution
 * - Recipient list with delivery status
 * - Batch history
 * - Campaign settings
 */
import { useState } from 'react'
import { X, Mail, Users, Settings, BarChart3, Eye, Code, Send } from 'lucide-react'
import Modal from '../ui/Modal'
import { resendRecipients, resendBatch } from '../../api/admin'

const TABS = ['overview', 'recipients', 'batches', 'settings']

export default function CampaignDetailsModal({ campaign, onClose, onStatusChange }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [showPreview, setShowPreview] = useState(false)
  const [selectedRecipients, setSelectedRecipients] = useState(new Set())
  const [selectedBatches, setSelectedBatches] = useState(new Set())
  const [isSending, setIsSending] = useState(false)

  const failedRecipients = campaign.failed_recipients || []

  // Use recipient_tracking if campaign has started, otherwise use recipients from campaign data
  const recipientsList = campaign.recipient_tracking || campaign.recipients || []

  const toggleRecipient = (email) => {
    const newSet = new Set(selectedRecipients)
    if (newSet.has(email)) {
      newSet.delete(email)
    } else {
      newSet.add(email)
    }
    setSelectedRecipients(newSet)
  }

  const toggleBatch = (batchNum) => {
    const newSet = new Set(selectedBatches)
    if (newSet.has(batchNum)) {
      newSet.delete(batchNum)
    } else {
      newSet.add(batchNum)
    }
    setSelectedBatches(newSet)
  }

  const handleResendRecipients = async () => {
    if (selectedRecipients.size === 0) return

    setIsSending(true)
    try {
      await resendRecipients(campaign.id, {
        emails: Array.from(selectedRecipients)
      })
      setSelectedRecipients(new Set())
      onStatusChange?.()
    } catch (error) {
      console.error('Failed to resend recipients:', error)
    } finally {
      setIsSending(false)
    }
  }

  const handleResendBatch = async (batchNum) => {
    setIsSending(true)
    try {
      await resendBatch(campaign.id, {
        batch_num: batchNum
      })
      onStatusChange?.()
    } catch (error) {
      console.error('Failed to resend batch:', error)
    } finally {
      setIsSending(false)
    }
  }

  const selectAllRecipients = () => {
    if (selectedRecipients.size === campaign.recipient_tracking?.length) {
      setSelectedRecipients(new Set())
    } else {
      const all = new Set(campaign.recipient_tracking?.map(r => r.email) || [])
      setSelectedRecipients(all)
    }
  }

  return (
    <Modal open onClose={onClose} title="Campaign Details" size="2xl">
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-surface-border">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-brand text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Status Summary */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-surface rounded-lg p-3 border border-surface-border">
                <p className="text-xs text-gray-500 mb-1">Total Recipients</p>
                <p className="text-xl font-bold text-white">{campaign.total_recipients}</p>
              </div>
              <div className="bg-surface rounded-lg p-3 border border-surface-border">
                <p className="text-xs text-gray-500 mb-1">Sent</p>
                <p className="text-xl font-bold text-green-400">{campaign.sent_count}</p>
              </div>
              <div className="bg-surface rounded-lg p-3 border border-surface-border">
                <p className="text-xs text-gray-500 mb-1">Failed</p>
                <p className="text-xl font-bold text-red-400">{campaign.failed_count}</p>
              </div>
              <div className="bg-surface rounded-lg p-3 border border-surface-border">
                <p className="text-xs text-gray-500 mb-1">Progress</p>
                <p className="text-xl font-bold text-brand">
                  {campaign.total_recipients > 0
                    ? Math.round((campaign.processed_count / campaign.total_recipients) * 100)
                    : 0}%
                </p>
              </div>
            </div>

            {/* Email Content */}
            <div className="bg-surface-raised rounded-lg p-4 border border-surface-border space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-2 flex items-center gap-2">
                  <Mail size={12} />
                  Subject
                </label>
                <p className="text-sm text-white break-words">{campaign.subject}</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-2 flex items-center gap-2">
                  <Eye size={12} />
                  Body Preview
                </label>
                <div className="space-y-2">
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="text-xs text-brand hover:text-brand/80"
                  >
                    {showPreview ? 'Hide' : 'Show'} full preview
                  </button>
                  {showPreview && (
                    <div className="bg-surface rounded p-3 border border-surface-border max-h-64 overflow-y-auto text-xs text-gray-300">
                      <div dangerouslySetInnerHTML={{ __html: campaign.body }} />
                    </div>
                  )}
                  {!showPreview && (
                    <p className="text-xs text-gray-400 line-clamp-2">
                      {campaign.body?.replace(/<[^>]*>/g, '').substring(0, 200)}...
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Account Distribution */}
            <div className="bg-surface-raised rounded-lg p-4 border border-surface-border space-y-3">
              <label className="text-xs font-semibold text-gray-400 uppercase flex items-center gap-2">
                <Users size={12} />
                Sending Accounts
              </label>
              <div className="space-y-2">
                {campaign.selected_accounts?.map((accId, idx) => {
                  const emailsPerAccount = Math.ceil(campaign.total_recipients / campaign.selected_accounts.length)
                  return (
                    <div key={idx} className="flex items-center justify-between p-2 bg-surface rounded text-xs">
                      <span className="text-gray-400">Account {accId}</span>
                      <span className="text-brand font-medium">~{emailsPerAccount} emails</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Campaign Settings */}
            <div className="bg-surface-raised rounded-lg p-4 border border-surface-border space-y-3">
              <label className="text-xs font-semibold text-gray-400 uppercase flex items-center gap-2">
                <Settings size={12} />
                Campaign Settings
              </label>
              <div className="space-y-2">
                {/* Signature Settings */}
                <div className="flex items-center justify-between p-2 bg-surface rounded text-xs">
                  <span className="text-gray-400">Signature</span>
                  <span className="text-white font-medium">
                    {campaign.config?.signature_mode === 'static'
                      ? `Static${campaign.config?.signature_id ? ' ✓' : ' (Not set)'}`
                      : campaign.config?.signature_mode === 'dynamic'
                      ? 'Dynamic ✓'
                      : 'Not set'}
                  </span>
                </div>

                {/* Include Signature */}
                <div className="flex items-center justify-between p-2 bg-surface rounded text-xs">
                  <span className="text-gray-400">Include Signature</span>
                  <span className={`font-medium ${campaign.config?.include_signature !== false ? 'text-green-400' : 'text-gray-500'}`}>
                    {campaign.config?.include_signature !== false ? 'Yes' : 'No'}
                  </span>
                </div>

                {/* Mark as Important */}
                <div className="flex items-center justify-between p-2 bg-surface rounded text-xs">
                  <span className="text-gray-400">Mark as Important</span>
                  <span className={`font-medium ${campaign.importance_high ? 'text-orange-400' : 'text-gray-500'}`}>
                    {campaign.importance_high ? '★ Yes' : 'No'}
                  </span>
                </div>

                {/* Distribution Strategy */}
                <div className="flex items-center justify-between p-2 bg-surface rounded text-xs">
                  <span className="text-gray-400">Distribution</span>
                  <span className="text-white font-medium capitalize">{campaign.recipient_distribution || 'round-robin'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recipients Tab */}
        {activeTab === 'recipients' && (
          <div className="space-y-4">
            {recipientsList && recipientsList.length > 0 ? (
              <>
                {/* Selection Controls - Only show for tracking data (when campaign is running) */}
                {campaign.recipient_tracking && campaign.recipient_tracking.length > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-surface-raised rounded border border-surface-border">
                    <input
                      type="checkbox"
                      checked={selectedRecipients.size === campaign.recipient_tracking.length}
                      onChange={selectAllRecipients}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs text-gray-400">
                      {selectedRecipients.size > 0 ? `${selectedRecipients.size} selected` : 'Select all'}
                    </span>
                    {selectedRecipients.size > 0 && (
                      <button
                        onClick={handleResendRecipients}
                        disabled={isSending}
                        className="ml-auto btn-primary text-xs flex items-center gap-1 disabled:opacity-50"
                      >
                        <Send size={12} />
                        Resend ({selectedRecipients.size})
                      </button>
                    )}
                  </div>
                )}

                {/* Recipients List */}
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {campaign.recipient_tracking && campaign.recipient_tracking.length > 0 ? (
                    // Tracked recipients (campaign is running/started)
                    Object.entries(
                      campaign.recipient_tracking.reduce((acc, r) => {
                        const accountId = r.account_id
                        if (!acc[accountId]) acc[accountId] = []
                        acc[accountId].push(r)
                        return acc
                      }, {})
                    ).map(([accountId, recipients]) => {
                      const stats = {
                        total: recipients.length,
                        sent: recipients.filter(r => r.status === 'sent').length,
                        failed: recipients.filter(r => r.status === 'failed').length,
                        pending: recipients.filter(r => r.status === 'pending').length,
                      }

                      return (
                        <div key={accountId} className="border border-surface-border rounded-lg overflow-hidden">
                          {/* Account Header */}
                          <div className="bg-surface-raised p-3 border-b border-surface-border">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-semibold text-white">Account {accountId}</h4>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="text-green-400">{stats.sent} sent</span>
                                {stats.failed > 0 && <span className="text-red-400">{stats.failed} failed</span>}
                                {stats.pending > 0 && <span className="text-gray-400">{stats.pending} pending</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-500">
                              <div className="flex-1 bg-surface rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="h-full bg-green-500"
                                  style={{width: `${stats.total > 0 ? (stats.sent / stats.total) * 100 : 0}%`}}
                                />
                              </div>
                              <span>{Math.round(stats.total > 0 ? (stats.sent / stats.total) * 100 : 0)}%</span>
                            </div>
                          </div>

                          {/* Recipients List */}
                          <div className="space-y-1 p-2 bg-surface max-h-48 overflow-y-auto">
                            {recipients.map((recipient, idx) => (
                              <div key={idx} className="space-y-1">
                                <label
                                  className={`p-2 rounded text-xs flex items-center gap-2 cursor-pointer transition ${
                                    recipient.status === 'sent'
                                      ? 'bg-green-500/10 text-green-300 hover:bg-green-500/15'
                                      : recipient.status === 'failed'
                                      ? 'bg-red-500/10 text-red-300 hover:bg-red-500/15'
                                      : 'bg-gray-500/10 text-gray-300 hover:bg-gray-500/15'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedRecipients.has(recipient.email)}
                                    onChange={() => toggleRecipient(recipient.email)}
                                    className="w-3 h-3 cursor-pointer"
                                  />
                                  <span className="font-mono truncate flex-1">{recipient.email}</span>
                                  <span className="ml-2 flex-shrink-0 capitalize">
                                    {recipient.status === 'sent' ? '✓' : recipient.status === 'failed' ? '✗' : '⊙'}
                                  </span>
                                </label>
                                {recipient.reason && (
                                  <div className="text-[10px] text-gray-500 ml-2 p-1 bg-surface-border rounded">
                                    {recipient.reason}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    // Draft campaign - show recipients list without tracking
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 italic">Campaign not started yet - showing recipients list</p>
                      <div className="bg-surface rounded border border-surface-border p-2 max-h-80 overflow-y-auto">
                        {recipientsList.map((recipient, idx) => {
                          const email = typeof recipient === 'string' ? recipient : (recipient.email || recipient)
                          return (
                            <div
                              key={idx}
                              className="p-2 text-xs text-gray-300 hover:bg-surface-raised transition flex items-center gap-2 border-b border-surface-border/50 last:border-b-0"
                            >
                              <span className="text-gray-500">•</span>
                              <span className="font-mono">{email}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-center text-sm text-gray-500 py-8">No recipients in this campaign</p>
            )}
          </div>
        )}

        {/* Batches Tab */}
        {activeTab === 'batches' && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {campaign.batch_history && campaign.batch_history.length > 0 ? (
              campaign.batch_history.map((batch, idx) => (
                <div key={idx} className="p-3 bg-surface rounded border border-surface-border text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-white">Batch #{batch.batchNum || idx + 1}</p>
                    <p className="text-gray-500">{batch.sentAt ? new Date(batch.sentAt).toLocaleTimeString() : '—'}</p>
                  </div>
                  <div className="flex items-center gap-3 text-gray-400">
                    <span>Sent: <span className="text-green-400">{batch.sent || 0}</span></span>
                    {batch.failed?.length > 0 && (
                      <span>Failed: <span className="text-red-400">{batch.failed.length}</span></span>
                    )}
                    <span>Duration: <span className="text-gray-300">{batch.durationMs ? `${(batch.durationMs / 1000).toFixed(1)}s` : '—'}</span></span>
                  </div>

                  {/* Resend Controls */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {batch.failed?.length > 0 && (
                      <button
                        onClick={() => handleResendBatch(batch.batchNum || idx + 1)}
                        disabled={isSending}
                        className="btn-secondary text-[11px] flex items-center gap-1 disabled:opacity-50"
                      >
                        <Send size={10} />
                        Resend Failed ({batch.failed.length})
                      </button>
                    )}
                    <button
                      onClick={() => handleResendBatch(batch.batchNum || idx + 1)}
                      disabled={isSending}
                      className="btn-secondary text-[11px] flex items-center gap-1 disabled:opacity-50"
                    >
                      <Send size={10} />
                      Resend All
                    </button>
                  </div>

                  {/* Failed Recipients List */}
                  {batch.failed?.length > 0 && (
                    <div className="mt-2 p-2 bg-red-500/10 rounded border border-red-500/20 text-[10px] max-h-32 overflow-y-auto">
                      <p className="text-red-400 font-semibold mb-1">Failed recipients:</p>
                      <div className="space-y-0.5">
                        {batch.failed.map((item, fidx) => {
                          const email = typeof item === 'string' ? item : item.email
                          const reason = typeof item === 'string' ? null : item.reason
                          return (
                            <div key={fidx} className="text-gray-400">
                              <p>{email}</p>
                              {reason && <p className="text-gray-500 ml-2">({reason})</p>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-center text-sm text-gray-500 py-8">No batch history yet</p>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-3">
            {campaign.campaign_settings && (
              <div className="bg-surface-raised rounded-lg p-4 border border-surface-border space-y-3">
                <label className="text-xs font-semibold text-gray-400 uppercase flex items-center gap-2">
                  <Settings size={12} />
                  Campaign Settings
                </label>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-gray-500">Mark as Important</p>
                    <p className="text-white font-medium">{campaign.campaign_settings.markAsImportant ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">IP Rotation</p>
                    <p className="text-white font-medium capitalize">{campaign.campaign_settings.ipRotation || 'None'}</p>
                  </div>
                  {campaign.campaign_settings.emailsPerHourRange && (
                    <div>
                      <p className="text-gray-500">Emails/Hour Range</p>
                      <p className="text-white font-medium">
                        {campaign.campaign_settings.emailsPerHourRange.min} - {campaign.campaign_settings.emailsPerHourRange.max}
                      </p>
                    </div>
                  )}
                  {campaign.campaign_settings.dailyLimitRange && (
                    <div>
                      <p className="text-gray-500">Daily Limit Range</p>
                      <p className="text-white font-medium">
                        {campaign.campaign_settings.dailyLimitRange.min} - {campaign.campaign_settings.dailyLimitRange.max}
                      </p>
                    </div>
                  )}
                  {campaign.campaign_settings.batchSizeRange && (
                    <div>
                      <p className="text-gray-500">Batch Size Range</p>
                      <p className="text-white font-medium">
                        {campaign.campaign_settings.batchSizeRange.min} - {campaign.campaign_settings.batchSizeRange.max}
                      </p>
                    </div>
                  )}
                  {campaign.campaign_settings.batchDelayRange && (
                    <div>
                      <p className="text-gray-500">Batch Delay Range</p>
                      <p className="text-white font-medium">
                        {Math.round(campaign.campaign_settings.batchDelayRange.min / 1000)}s - {Math.round(campaign.campaign_settings.batchDelayRange.max / 1000)}s
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-500">IP Warmup</p>
                    <p className="text-white font-medium">{campaign.campaign_settings.enableIpWarmup ? 'Enabled' : 'Disabled'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end mt-4 pt-4 border-t border-surface-border">
        <button onClick={onClose} className="btn-ghost text-xs">Close</button>
      </div>
    </Modal>
  )
}
