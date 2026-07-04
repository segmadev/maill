import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Pause, RotateCcw, AlertTriangle, CheckCircle, AlertCircle, ChevronLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/layout/AdminLayout'
import { useBulkCampaignDetail, useCampaignQueue } from '../hooks/useBulkCampaigns'
import { updateBulkCampaign } from '../api/admin'
import Spinner from '../components/ui/Spinner'
import AdminControls from '../components/bulk-campaigns/AdminControls'

export default function CampaignMonitorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { campaign, stats, loading, autoRefresh, setAutoRefresh, refetch } = useBulkCampaignDetail(id)
  const { items: queueItems } = useCampaignQueue(id)
  const [actionLoading, setActionLoading] = useState(false)

  if (loading) {
    return (
      <AdminLayout title="Campaign Monitor">
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      </AdminLayout>
    )
  }

  if (!campaign) {
    return (
      <AdminLayout title="Campaign Not Found">
        <div className="text-center py-12">
          <p className="text-gray-400">Campaign not found</p>
          <button
            onClick={() => navigate('/campaigns')}
            className="mt-4 px-4 py-2 rounded bg-brand hover:bg-brand/90 text-white"
          >
            Back to Campaigns
          </button>
        </div>
      </AdminLayout>
    )
  }

  const isRunning = campaign.status === 'running'
  const isPaused = campaign.status === 'paused'

  const handleAction = async (action) => {
    setActionLoading(true)
    try {
      await updateBulkCampaign(id, { action })
      toast.success(`Campaign ${action}ed successfully`)
      await refetch()
    } catch (err) {
      toast.error(`Failed to ${action} campaign`)
    } finally {
      setActionLoading(false)
    }
  }

  const progressPercent = campaign.recipient_count > 0
    ? Math.round((campaign.sent_count + campaign.failed_count) / campaign.recipient_count * 100)
    : 0

  const bounceRate = campaign.sent_count > 0
    ? Math.round((campaign.bounced_count / campaign.sent_count) * 100)
    : 0

  const complaintRate = campaign.sent_count > 0
    ? Math.round((campaign.complaint_count / campaign.sent_count) * 100)
    : 0

  return (
    <AdminLayout title={campaign.name}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate('/campaigns')}
            className="flex items-center gap-2 text-brand hover:text-brand/80 font-medium mb-4 transition-colors"
          >
            <ChevronLeft size={18} /> Back to Campaigns
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">{campaign.name}</h2>
              <p className="text-gray-400 text-sm mt-1 truncate">{campaign.subject}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold text-white ${getStatusColor(campaign.status)}`}>
                {campaign.status.toUpperCase()}
              </div>
              {isRunning && (
                <button
                  onClick={() => handleAction('pause')}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white disabled:opacity-50"
                >
                  {actionLoading ? <Spinner size={16} /> : <Pause size={16} />}
                  Pause
                </button>
              )}
              {isPaused && (
                <button
                  onClick={() => handleAction('resume')}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                >
                  {actionLoading ? <Spinner size={16} /> : <RotateCcw size={16} />}
                  Resume
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Auto-refresh */}
        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={e => setAutoRefresh(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-blue-300">Auto-refresh enabled (every 3 seconds)</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatBox label="Recipients" value={campaign.recipient_count} />
          <StatBox label="Sent" value={campaign.sent_count} />
          <StatBox label="Failed" value={campaign.failed_count} isWarning={campaign.failed_count > 0} />
          <StatBox label="Bounced" value={campaign.bounced_count} />
        </div>

        {/* Progress */}
        <div className="bg-surface-raised rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Progress</h2>
            <span className="text-2xl font-bold text-blue-400">{progressPercent}%</span>
          </div>

          <div className="w-full bg-gray-700 rounded-full h-3 mb-4">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">Sent + Failed</p>
              <p className="text-white text-lg font-bold">{campaign.sent_count + campaign.failed_count} / {campaign.recipient_count}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">Remaining</p>
              <p className="text-white text-lg font-bold">{Math.max(0, campaign.recipient_count - campaign.sent_count - campaign.failed_count)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">Queue Status</p>
              <p className="text-white text-lg font-bold">{stats?.pending || 0} pending</p>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {(bounceRate > 5 || complaintRate > 0 || campaign.failed_count > 0) && (
          <div className="space-y-3">
            {bounceRate > 5 && (
              <div className="bg-yellow-600/20 border border-yellow-600 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle size={20} className="text-yellow-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm text-yellow-300">High Bounce Rate</p>
                  <p className="text-xs text-yellow-200 mt-1">{bounceRate}% of emails are bouncing. Your account may be flagged.</p>
                </div>
              </div>
            )}
            {complaintRate > 0 && (
              <div className="bg-red-600/20 border border-red-600 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle size={20} className="text-red-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm text-red-300">Complaints Received</p>
                  <p className="text-xs text-red-200 mt-1">{campaign.complaint_count} complaint(s) - consider pausing this campaign.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Queue Preview */}
        <div className="bg-surface-raised rounded-lg p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Upcoming Emails (Next 5)</h2>
          <div className="space-y-2">
            {queueItems.length === 0 ? (
              <p className="text-gray-400 text-sm">No pending emails</p>
            ) : (
              queueItems.slice(0, 5).map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded bg-gray-900">
                  <div>
                    <p className="text-sm text-white">{idx + 1}. {item.recipient_email}</p>
                    {item.recipient_name && <p className="text-xs text-gray-400">{item.recipient_name}</p>}
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-blue-600/30 text-blue-300">{item.status}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4">
          <MetricBox label="Bounce Rate" value={`${bounceRate}%`} />
          <MetricBox label="Complaint Rate" value={`${complaintRate}%`} />
          <MetricBox label="Success Rate" value={`${100 - bounceRate}%`} />
        </div>

        {/* Campaign Info */}
        <div className="bg-surface-raised rounded-lg p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Campaign Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400">Strategy</p>
              <p className="text-white font-medium">{campaign.ip_rotation_strategy?.replace('-', ' ')}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Daily Limit</p>
              <p className="text-white font-medium">{campaign.ip_daily_limit} emails/account</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Created</p>
              <p className="text-white font-medium">{new Date(campaign.created_at).toLocaleDateString()}</p>
            </div>
            {campaign.started_at && (
              <div>
                <p className="text-xs text-gray-400">Started</p>
                <p className="text-white font-medium">{new Date(campaign.started_at).toLocaleDateString()}</p>
              </div>
            )}
          </div>
        </div>

        {/* Admin Controls */}
        <AdminControls campaign={campaign} accounts={[]} />
      </div>
    </AdminLayout>
  )
}

function StatBox({ label, value, isWarning }) {
  return (
    <div className={`rounded-lg p-4 border ${isWarning ? 'bg-red-600/10 border-red-600' : 'bg-surface-raised border-gray-700'}`}>
      <p className="text-gray-400 text-xs font-medium mb-2">{label}</p>
      <p className={`text-3xl font-bold ${isWarning ? 'text-red-400' : 'text-white'}`}>{value}</p>
    </div>
  )
}

function MetricBox({ label, value }) {
  return (
    <div className="rounded-lg p-4 border border-gray-700 text-center">
      <p className="text-gray-400 text-sm mb-2">{label}</p>
      <p className="text-3xl font-bold text-blue-400">{value}</p>
    </div>
  )
}

function getStatusColor(status) {
  const colors = {
    draft: 'bg-gray-600',
    running: 'bg-blue-600',
    paused: 'bg-yellow-600',
    completed: 'bg-green-600',
    failed: 'bg-red-600',
  }
  return colors[status] || 'bg-gray-600'
}
