import { useState } from 'react'
import { Plus, Play, Pause, RotateCcw, Trash2, ChevronDown, ChevronUp, Zap, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/layout/AdminLayout'
import CampaignBuilder from '../components/bulk-campaigns/CampaignBuilder'
import { useBulkCampaigns, useBulkCampaignDetail, useCampaignQueue } from '../hooks/useBulkCampaigns'
import Spinner from '../components/ui/Spinner'

const STATUS_COLORS = {
  draft: 'bg-gray-600',
  running: 'bg-blue-600',
  paused: 'bg-yellow-600',
  completed: 'bg-green-600',
  failed: 'bg-red-600',
}

const STATUS_LABELS = {
  draft: 'Draft',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
}

export default function BulkCampaignsPage() {
  const {
    campaigns,
    loading,
    page,
    setPage,
    total,
    perPage,
    setPerPage,
    status,
    setStatus,
    updateCampaign,
    deleteCampaign,
  } = useBulkCampaigns()

  const [showBuilder, setShowBuilder] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [expandedCampaignId, setExpandedCampaignId] = useState(null)

  // Load details for expanded campaign
  const { campaign: detailCampaign, stats, refetch } = useBulkCampaignDetail(expandedCampaignId)
  const { items: queueItems } = useCampaignQueue(expandedCampaignId)

  const handleAction = async (id, action) => {
    setActionLoading(id)
    try {
      await updateCampaign(id, action)
      toast.success(`Campaign ${action}ed successfully`)
    } catch (err) {
      // Error handled by hook
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (id) => {
    setActionLoading(id)
    try {
      await deleteCampaign(id)
    } catch (err) {
      // Error handled by hook
    } finally {
      setActionLoading(null)
      setDeleteConfirm(null)
    }
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <AdminLayout title="Bulk Email">
      <div className="space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox
            icon={<Zap size={20} />}
            label="Total Campaigns"
            value={total}
            color="blue"
          />
          <StatBox
            icon={<TrendingUp size={20} />}
            label="Running"
            value={campaigns.filter(c => c.status === 'running').length}
            color="green"
          />
          <StatBox
            icon={<Plus size={20} />}
            label="Draft"
            value={campaigns.filter(c => c.status === 'draft').length}
            color="yellow"
          />
          <StatBox
            icon={<Pause size={20} />}
            label="Paused"
            value={campaigns.filter(c => c.status === 'paused').length}
            color="orange"
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Campaigns</h2>
            <p className="text-gray-400 text-sm mt-1">Create, manage, and monitor bulk email campaigns</p>
          </div>
          <button
            onClick={() => setShowBuilder(true)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-brand hover:bg-brand/90 text-white font-medium transition-colors"
          >
            <Plus size={20} /> New Campaign
          </button>
        </div>

      {/* Filters */}
      <div className="flex gap-3">
        <button
          onClick={() => setStatus(null)}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            status === null
              ? 'bg-white text-black'
              : 'bg-dark-3 text-gray-400 hover:text-white border border-dark-4'
          }`}
        >
          All
        </button>
        {['draft', 'running', 'paused', 'completed', 'failed'].map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 rounded capitalize font-medium transition-colors text-sm ${
              status === s
                ? 'bg-white text-black'
                : 'bg-dark-3 text-gray-400 hover:text-white border border-dark-4'
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Campaign List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <p className="text-lg">No campaigns yet</p>
            <p className="text-sm">Create one to get started</p>
          </div>
          <button
            onClick={() => setShowBuilder(true)}
            className="px-6 py-2 rounded-lg bg-brand hover:bg-brand/90 text-white"
          >
            Create Campaign
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {campaigns.map(campaign => (
              <div key={campaign.id}>
                <CampaignCard
                  campaign={campaign}
                  onAction={handleAction}
                  onDelete={() => setDeleteConfirm(campaign.id)}
                  isLoading={actionLoading === campaign.id}
                  isExpanded={expandedCampaignId === campaign.id}
                  onToggleExpand={() => setExpandedCampaignId(expandedCampaignId === campaign.id ? null : campaign.id)}
                />

                {/* Expanded Campaign Details */}
                {expandedCampaignId === campaign.id && detailCampaign && (
                  <CampaignDetails
                    campaign={detailCampaign}
                    stats={stats}
                    queueItems={queueItems}
                    onAction={handleAction}
                    isLoading={actionLoading === campaign.id}
                    onRefresh={refetch}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-700">
              <select
                value={perPage}
                onChange={e => setPerPage(parseInt(e.target.value))}
                className="px-3 py-2 rounded bg-surface-raised border border-gray-700 text-white text-sm"
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
              </select>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-2 rounded bg-surface-raised hover:bg-gray-700 text-white disabled:opacity-50"
                >
                  ← Previous
                </button>
                <span className="text-white text-sm">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-2 rounded bg-surface-raised hover:bg-gray-700 text-white disabled:opacity-50"
                >
                  Next →
                </button>
              </div>

              <div className="text-gray-400 text-sm">
                Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-raised rounded-lg p-6 max-w-sm">
            <h3 className="text-lg font-bold text-white mb-2">Delete Campaign?</h3>
            <p className="text-gray-400 mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={actionLoading === deleteConfirm}
                className="flex-1 px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {actionLoading === deleteConfirm ? <Spinner size={16} /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Campaign Builder Modal */}
        <CampaignBuilder
          open={showBuilder}
          onClose={() => setShowBuilder(false)}
          onSuccess={() => setShowBuilder(false)}
        />
      </div>
    </AdminLayout>
  )
}

function CampaignCard({ campaign, onAction, onDelete, isLoading, isExpanded, onToggleExpand }) {
  const progressPercent = campaign.recipient_count > 0
    ? Math.round((campaign.sent_count + campaign.failed_count) / campaign.recipient_count * 100)
    : 0

  const bounceRate = campaign.sent_count > 0
    ? Math.round((campaign.bounced_count / campaign.sent_count) * 100)
    : 0

  const isRunning = campaign.status === 'running'
  const isDraft = campaign.status === 'draft'
  const isPaused = campaign.status === 'paused'

  return (
    <div className="bg-surface-raised rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors">
      <div className="flex items-start gap-4">
        {/* Status and Title */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div
              className={`px-2.5 py-1 rounded text-xs font-semibold text-white ${
                STATUS_COLORS[campaign.status]
              }`}
            >
              {campaign.status.toUpperCase()}
            </div>
            <h3 className="text-lg font-semibold text-white">{campaign.name}</h3>
          </div>

          <p className="text-sm text-gray-400 truncate mb-3">{campaign.subject}</p>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <StatBox label="Recipients" value={campaign.recipient_count} />
            <StatBox label="Sent" value={campaign.sent_count} />
            <StatBox label="Failed" value={campaign.failed_count} />
            <StatBox label="Bounced" value={campaign.bounced_count} />
          </div>

          {/* Progress Bar */}
          {isRunning && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Progress</span>
                <span className="text-xs text-white font-medium">{progressPercent}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Alerts */}
          {bounceRate > 5 && (
            <div className="text-xs text-yellow-400 mb-2">
              High bounce rate: {bounceRate}%
            </div>
          )}
          {campaign.complaint_count > 0 && (
            <div className="text-xs text-red-400 mb-2">
              {campaign.complaint_count} complaint{campaign.complaint_count !== 1 ? 's' : ''} received
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleExpand}
            className="p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            title={isExpanded ? "Collapse" : "Expand Details"}
          >
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {isDraft && (
            <button
              onClick={() => onAction(campaign.id, 'start')}
              disabled={isLoading}
              className="p-2 rounded hover:bg-blue-600 text-blue-400 hover:text-white transition-colors disabled:opacity-50"
              title="Start"
            >
              {isLoading ? <Spinner size={18} /> : <Play size={18} />}
            </button>
          )}

          {isRunning && (
            <button
              onClick={() => onAction(campaign.id, 'pause')}
              disabled={isLoading}
              className="p-2 rounded hover:bg-yellow-600 text-yellow-400 hover:text-white transition-colors disabled:opacity-50"
              title="Pause"
            >
              {isLoading ? <Spinner size={18} /> : <Pause size={18} />}
            </button>
          )}

          {isPaused && (
            <button
              onClick={() => onAction(campaign.id, 'resume')}
              disabled={isLoading}
              className="p-2 rounded hover:bg-green-600 text-green-400 hover:text-white transition-colors disabled:opacity-50"
              title="Resume"
            >
              {isLoading ? <Spinner size={18} /> : <RotateCcw size={18} />}
            </button>
          )}

          {(isDraft || isPaused) && (
            <button
              onClick={onDelete}
              disabled={isLoading}
              className="p-2 rounded hover:bg-red-600 text-red-400 hover:text-white transition-colors disabled:opacity-50"
              title="Delete"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Date Info */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700">
        <span className="text-xs text-gray-500">
          Created {new Date(campaign.created_at).toLocaleDateString()}
        </span>
        {campaign.started_at && (
          <span className="text-xs text-gray-500">
            Started {new Date(campaign.started_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  )
}

function CampaignDetails({ campaign, stats, queueItems, onAction, isLoading, onRefresh }) {
  const [autoRefresh, setAutoRefresh] = useState(false)

  const progressPercent = campaign.recipient_count > 0
    ? Math.round((campaign.sent_count + campaign.failed_count) / campaign.recipient_count * 100)
    : 0

  const bounceRate = campaign.sent_count > 0
    ? Math.round((campaign.bounced_count / campaign.sent_count) * 100)
    : 0

  const complaintRate = campaign.sent_count > 0
    ? Math.round((campaign.complaint_count / campaign.sent_count) * 100)
    : 0

  const isRunning = campaign.status === 'running'
  const isPaused = campaign.status === 'paused'

  return (
    <div className="bg-surface-raised rounded-lg p-6 border border-brand/30 space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Campaign Details</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            <span className="text-gray-300">Auto-refresh</span>
          </label>
          <button
            onClick={onRefresh}
            className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-white text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Recipients" value={campaign.recipient_count} color="blue" />
        <StatBox label="Sent" value={campaign.sent_count} color="green" />
        <StatBox label="Failed" value={campaign.failed_count} color="red" />
        <StatBox label="Bounced" value={campaign.bounced_count} color="yellow" />
      </div>

      {/* Progress */}
      {isRunning && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white">Progress</span>
            <span className="text-sm text-gray-400">{progressPercent}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Rates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-800/50 rounded p-3">
          <p className="text-xs text-gray-400 mb-1">Bounce Rate</p>
          <p className="text-xl font-bold text-white">{bounceRate}%</p>
        </div>
        <div className="bg-gray-800/50 rounded p-3">
          <p className="text-xs text-gray-400 mb-1">Complaint Rate</p>
          <p className="text-xl font-bold text-white">{complaintRate}%</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {(campaign.status === 'draft' || campaign.status === 'paused') && (
          <button
            onClick={() => onAction(campaign.id, isRunning ? 'pause' : 'start')}
            disabled={isLoading}
            className="flex-1 px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium transition"
          >
            {isLoading ? <Spinner size={16} /> : isRunning ? 'Pause' : 'Start Campaign'}
          </button>
        )}

        {isPaused && (
          <button
            onClick={() => onAction(campaign.id, 'resume')}
            disabled={isLoading}
            className="flex-1 px-4 py-2 rounded bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-medium transition"
          >
            {isLoading ? <Spinner size={16} /> : 'Resume Campaign'}
          </button>
        )}
      </div>

      {/* Queue Items */}
      {queueItems && queueItems.length > 0 && (
        <div className="pt-4 border-t border-gray-700">
          <h4 className="text-sm font-semibold text-white mb-3">Recent Activity</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {queueItems.slice(0, 10).map(item => (
              <div key={item.id} className="flex items-center justify-between text-xs p-2 bg-gray-900 rounded">
                <span className="text-gray-400">{item.recipient_email}</span>
                <span className={`px-2 py-1 rounded ${
                  item.status === 'sent' ? 'bg-green-600/30 text-green-300' :
                  item.status === 'failed' ? 'bg-red-600/30 text-red-300' :
                  'bg-blue-600/30 text-blue-300'
                }`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, icon, color = 'blue' }) {
  const colorMap = {
    blue: 'bg-blue-950 border-blue-700 text-blue-300',
    green: 'bg-green-950 border-green-700 text-green-300',
    yellow: 'bg-yellow-950 border-yellow-700 text-yellow-300',
    orange: 'bg-orange-950 border-orange-700 text-orange-300',
    red: 'bg-red-950 border-red-700 text-red-300',
  }

  return (
    <div className={`rounded-lg p-4 border ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-400">{label}</p>
        <div className="opacity-80">{icon}</div>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  )
}
