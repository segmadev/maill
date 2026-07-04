/**
 * BulkSendPage
 *
 * Dedicated dashboard for managing bulk email campaigns
 * - List all campaigns (running, paused, completed, draft)
 * - Create new campaigns via wizard modal
 * - Manage campaigns (pause, resume, cancel)
 * - View campaign details and history
 */
import { useState, useEffect } from 'react'
import {
  Plus, Play, Pause, X, Clock, CheckCircle2, AlertCircle,
  Loader, ChevronDown, TrendingUp, BarChart3, Filter, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/layout/AdminLayout'
import {
  listBulkCampaigns, startBulkCampaign, pauseBulkCampaign,
  cancelBulkCampaign, deleteBulkCampaign, getBulkCampaign, checkAccountStatus,
} from '../api/admin'
import BulkSendModal from '../components/mail/BulkSendModal'
import CampaignDetailsModal from '../components/mail/CampaignDetailsModal'
import useBulkSendStore from '../store/bulkSendStore'

const STATUS_COLORS = {
  draft: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  queued: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  running: 'bg-green-500/20 text-green-300 border-green-500/30',
  paused: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  cancelled: 'bg-red-500/20 text-red-300 border-red-500/30',
  failed: 'bg-red-500/20 text-red-300 border-red-500/30',
}

const STATUS_ICONS = {
  draft: <Clock size={14} />,
  queued: <Clock size={14} className="animate-pulse" />,
  running: <Loader size={14} className="animate-spin" />,
  paused: <Pause size={14} />,
  completed: <CheckCircle2 size={14} />,
  cancelled: <X size={14} />,
  failed: <AlertCircle size={14} />,
}

function formatTime(date) {
  if (!date) return '—'
  return new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDuration(seconds) {
  if (!seconds) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

export default function BulkSendPage() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [expandedId, setExpandedId] = useState(null)

  // Load campaigns initially and on filter change
  useEffect(() => {
    loadCampaigns()
  }, [filterStatus])

  // Auto-poll every 5s (will check if active inside loadCampaigns)
  useEffect(() => {
    const interval = setInterval(() => {
      // Only poll if there are active campaigns
      const activeStatus = ['running', 'paused', 'queued']
      const hasActive = campaigns.some(c => activeStatus.includes(c.status))

      if (hasActive) {
        loadCampaigns()
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const loadCampaigns = async () => {
    setLoading(true)
    try {
      const params = filterStatus !== 'all' ? { status: filterStatus } : {}
      const data = await listBulkCampaigns(params)
      setCampaigns(data.campaigns || [])
    } catch (err) {
      toast.error('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }

  const handleStart = async (campaign) => {
    try {
      // 0. Check account status before starting
      for (const accountId of campaign.selected_accounts) {
        try {
          const status = await checkAccountStatus(accountId)
          if (status?.error === 'graph_forbidden' || status?.suspended) {
            toast.error(`Account ${accountId} is suspended. Check your Microsoft account inbox for verification.`)
            return
          }
        } catch (err) {
          // If account check fails, continue anyway (might be a transient error)
          console.warn(`Could not check account ${accountId} status`, err)
        }
      }

      // 1. Start campaign on backend (applies allocation strategy)
      const updated = await startBulkCampaign(campaign.id)
      setCampaigns(campaigns.map(c => c.id === campaign.id ? updated.campaign : c))
      toast.success('Campaign started, sending emails...')

      // 2. Fetch full campaign with recipient_tracking
      const fullCampaign = await getBulkCampaign(campaign.id)
      const campaignData = fullCampaign.campaign

      console.log('Campaign data:', campaignData)
      console.log('Recipient tracking:', campaignData?.recipient_tracking)

      // 3. Group recipients by account from recipient_tracking
      const grouped = {}
      if (campaignData?.recipient_tracking && campaignData.recipient_tracking.length > 0) {
        campaignData.recipient_tracking.forEach(rec => {
          if (!grouped[rec.account_id]) grouped[rec.account_id] = []
          grouped[rec.account_id].push({
            email: rec.email,
            data: rec.data || {}
          })
        })
      } else {
        console.warn('No recipient_tracking found, falling back to recipients')
        // Fallback: use selected_accounts with original recipients if allocation didn't work
        const defaultAccountId = campaignData?.selected_accounts?.[0]
        if (defaultAccountId && campaignData?.recipients) {
          grouped[defaultAccountId] = campaignData.recipients.map(r => ({
            email: r.email,
            data: r.data || {}
          }))
        }
      }

      // 4. Send per account sequentially
      const store = useBulkSendStore.getState()
      const accountIds = Object.keys(grouped).map(Number)

      console.log('Account IDs:', accountIds)
      console.log('Grouped data:', grouped)

      if (accountIds.length === 0) {
        toast.error('No recipients or accounts found')
        return
      }

      for (const accountId of accountIds) {
        const recipients = grouped[accountId]
        console.log(`Starting send for account ${accountId} with ${recipients.length} recipients`)

        // Start sending for this account (fire-and-forget async)
        store.startSending({
          accountId,
          subjectTemplate: campaignData.subject,
          bodyTemplate: campaignData.body,
          recipients,
          batchSize: campaignData.campaign_settings?.batchSizeRange?.max || 50,
          batchDelay: campaignData.campaign_settings?.batchDelayRange?.max || 2000,
          base64Fields: campaignData.base64_fields || [],
          campaignId: campaign.id,
          signatureId: campaignData.campaign_settings?.signature_id,
          includeSignature: campaignData.campaign_settings?.include_signature ?? true,
        })

        // Wait for this account to finish before starting next
        await new Promise(resolve => {
          const checkStatus = () => {
            const state = useBulkSendStore.getState()
            if (state.status === 'done' || state.status === 'cancelled') {
              console.log(`Finished sending for account ${accountId}`)
              resolve()
            } else {
              setTimeout(checkStatus, 500)
            }
          }
          checkStatus()
        })
      }
    } catch (err) {
      console.error('Error starting campaign:', err)

      // Better error messages for common issues
      const errorCode = err.response?.data?.error
      const errorMsg = err.response?.data?.message

      if (errorCode === 'graph_forbidden') {
        toast.error('Account suspended: Check your Microsoft account inbox to verify your account')
      } else if (errorMsg?.includes('suspended')) {
        toast.error('Account is suspended. Please verify your Microsoft account.')
      } else if (errorMsg?.includes('rate limit')) {
        toast.error('Rate limit exceeded. Wait a few minutes before trying again.')
      } else {
        toast.error(errorMsg || 'Failed to start campaign')
      }
    }
  }

  const handlePause = async (campaign) => {
    try {
      const updated = await pauseBulkCampaign(campaign.id)
      setCampaigns(campaigns.map(c => c.id === campaign.id ? updated.campaign : c))
      toast.success('Campaign paused')
    } catch (err) {
      toast.error('Failed to pause campaign')
    }
  }

  const handleCancel = async (campaign) => {
    if (!window.confirm('Cancel this campaign? This cannot be undone.')) return
    try {
      const updated = await cancelBulkCampaign(campaign.id)
      setCampaigns(campaigns.map(c => c.id === campaign.id ? updated.campaign : c))
      toast.success('Campaign cancelled')
    } catch (err) {
      toast.error('Failed to cancel campaign')
    }
  }

  const handleDelete = async (campaign) => {
    if (!window.confirm('Delete this campaign? This cannot be undone.')) return
    try {
      await deleteBulkCampaign(campaign.id)
      setCampaigns(campaigns.filter(c => c.id !== campaign.id))
      toast.success('Campaign deleted')
    } catch (err) {
      toast.error('Failed to delete campaign')
    }
  }

  const getStats = (campaign) => {
    const percentage = campaign.total_recipients > 0
      ? Math.round((campaign.processed_count / campaign.total_recipients) * 100)
      : 0
    return { percentage, remaining: campaign.total_recipients - campaign.processed_count }
  }

  const activeStatus = ['running', 'paused', 'queued']
  const hasActive = campaigns.some(c => activeStatus.includes(c.status))

  return (
    <AdminLayout title="Bulk Email Campaigns">
      <div className="space-y-6">
        {/* Page Header with Action */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-gray-500">Manage and monitor bulk email sending</p>
          </div>
          <button
            onClick={() => setShowWizard(true)}
            className="btn-primary gap-2 flex items-center"
          >
            <Plus size={16} />
            New Campaign
          </button>
        </div>

      {/* Filter Bar & Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-600" />
          <div className="flex gap-1">
            {['all', 'draft', 'queued', 'running', 'paused', 'completed', 'cancelled'].map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterStatus === status
                    ? 'bg-brand text-white'
                    : 'bg-surface-border text-gray-400 hover:text-gray-300'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-polling indicator & Manual reload button */}
        <div className="flex items-center gap-2">
          {hasActive ? (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Updating every 5s
            </span>
          ) : (
            <button
              onClick={() => loadCampaigns()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-border hover:bg-surface-border/80 text-gray-400 hover:text-gray-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Reload
            </button>
          )}
        </div>
      </div>

      {/* Campaigns List */}
      <div className="space-y-2">
        {loading && campaigns.length === 0 ? (
          <div className="text-center py-8">
            <Loader size={24} className="animate-spin mx-auto text-gray-600 mb-2" />
            <p className="text-sm text-gray-500">Loading campaigns...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-lg border border-surface-border">
            <BarChart3 size={32} className="mx-auto text-gray-700 mb-2" />
            <p className="text-gray-400">No campaigns yet</p>
            <p className="text-xs text-gray-600 mt-1">Create one to get started</p>
          </div>
        ) : (
          campaigns.map(campaign => {
            const stats = getStats(campaign)
            const isExpanded = expandedId === campaign.id
            const isActive = ['running', 'paused', 'queued'].includes(campaign.status)

            return (
              <div key={campaign.id} className="bg-surface-raised rounded-lg border border-surface-border overflow-hidden">
                {/* Campaign Row */}
                <div className="flex items-center justify-between p-4 hover:bg-surface/50 transition-colors cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : campaign.id)}>
                  <div className="flex-1 min-w-0 flex items-center gap-4">
                    {/* Status Icon */}
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                      STATUS_COLORS[campaign.status].split(' ')[0]
                    }`}>
                      {STATUS_ICONS[campaign.status]}
                    </div>

                    {/* Campaign Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-white truncate">{campaign.name || campaign.subject}</h3>
                        <span className={`text-xs font-medium px-2 py-1 rounded-full border ${STATUS_COLORS[campaign.status]}`}>
                          {campaign.status}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      {isActive && (
                        <div className="space-y-1">
                          <div className="w-full bg-surface-border rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full bg-brand transition-all"
                              style={{ width: `${stats.percentage}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500">
                            {campaign.processed_count} / {campaign.total_recipients} sent ({stats.percentage}%)
                          </p>
                        </div>
                      )}

                      {/* Summary Stats */}
                      {!isActive && (
                        <p className="text-xs text-gray-500">
                          {campaign.total_recipients} recipients • {campaign.selected_accounts?.length || 1} account{campaign.selected_accounts?.length !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="text-right text-xs text-gray-500 mr-4">
                    <p>{formatTime(campaign.started_at || campaign.created_at)}</p>
                    {campaign.duration && <p className="text-gray-600">{formatDuration(campaign.duration)}</p>}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5 pl-4 border-l border-surface-border">
                    {campaign.status === 'running' && (
                      <button onClick={(e) => { e.stopPropagation(); handlePause(campaign) }}
                        className="p-2 rounded-lg hover:bg-surface text-yellow-400 transition-colors" title="Pause">
                        <Pause size={16} />
                      </button>
                    )}
                    {campaign.status === 'paused' && (
                      <button onClick={(e) => { e.stopPropagation(); handleStart(campaign) }}
                        className="p-2 rounded-lg hover:bg-surface text-green-400 transition-colors" title="Resume">
                        <Play size={16} />
                      </button>
                    )}
                    {campaign.status === 'draft' && (
                      <button onClick={(e) => { e.stopPropagation(); handleStart(campaign) }}
                        className="p-2 rounded-lg hover:bg-surface text-green-400 transition-colors" title="Start">
                        <Play size={16} />
                      </button>
                    )}
                    {isActive && (
                      <button onClick={(e) => { e.stopPropagation(); handleCancel(campaign) }}
                        className="p-2 rounded-lg hover:bg-surface text-red-400 transition-colors" title="Cancel">
                        <X size={16} />
                      </button>
                    )}
                    {!isActive && (
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(campaign) }}
                        className="p-2 rounded-lg hover:bg-surface text-gray-600 hover:text-red-400 transition-colors" title="Delete">
                        <X size={16} />
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setSelectedCampaign(campaign); setShowDetails(true) }}
                      className="p-2 rounded-lg hover:bg-surface text-brand transition-colors">
                      <ChevronDown size={16} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-surface-border bg-surface px-4 py-3 space-y-3">
                    {/* Accounts */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Sending Accounts</p>
                      <div className="flex flex-wrap gap-1">
                        {campaign.selected_accounts?.map(accId => (
                          <span key={accId} className="text-xs bg-surface-border px-2 py-1 rounded text-gray-300">
                            Account {accId}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Campaign Settings */}
                    {campaign.campaign_settings && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Campaign Settings</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {campaign.campaign_settings.emailsPerHourRange && (
                            <div>
                              <p className="text-gray-600">Emails/Hour:</p>
                              <p className="text-gray-300">{campaign.campaign_settings.emailsPerHourRange.min}-{campaign.campaign_settings.emailsPerHourRange.max}</p>
                            </div>
                          )}
                          {campaign.campaign_settings.dailyLimitRange && (
                            <div>
                              <p className="text-gray-600">Daily Limit:</p>
                              <p className="text-gray-300">{campaign.campaign_settings.dailyLimitRange.min}-{campaign.campaign_settings.dailyLimitRange.max}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* View Details Button */}
                    <button onClick={() => { setSelectedCampaign(campaign); setShowDetails(true) }}
                      className="w-full btn-ghost text-xs mt-2">
                      View Full Details →
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Wizard Modal */}
      <BulkSendModal
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCampaignCreated={() => {
          setShowWizard(false)
          loadCampaigns()
        }}
      />

      {/* Details Modal */}
      {showDetails && selectedCampaign && (
        <CampaignDetailsModal
          campaign={selectedCampaign}
          onClose={() => setShowDetails(false)}
          onStatusChange={() => loadCampaigns()}
        />
      )}
      </div>
    </AdminLayout>
  )
}
