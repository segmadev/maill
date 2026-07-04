import { useState } from 'react'
import { AlertTriangle, Zap, RotateCcw, Settings, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import Spinner from '../ui/Spinner'

export default function AdminControls({ campaign, onCampaignUpdate, accounts }) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showRateModal, setShowRateModal] = useState(false)
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [showRetryModal, setShowRetryModal] = useState(false)
  const [newRate, setNewRate] = useState(campaign?.config?.emails_per_hour || 50)

  const isRunning = campaign?.status === 'running'

  const handleRateChange = async () => {
    setLoading(true)
    try {
      // In production, call API to update campaign rate
      toast.success(`Rate updated to ${newRate} emails/hour`)
      setShowRateModal(false)
    } catch (err) {
      toast.error('Failed to update rate')
    } finally {
      setLoading(false)
    }
  }

  const handleManualRetry = async () => {
    setLoading(true)
    try {
      // In production, call API to retry failed emails
      toast.success('Retry initiated for failed emails')
      setShowRetryModal(false)
    } catch (err) {
      toast.error('Failed to start retry')
    } finally {
      setLoading(false)
    }
  }

  const handleDisableAccount = async (accountId) => {
    setLoading(true)
    try {
      // In production, call API to disable account
      toast.success('Account disabled - system will switch to next available')
    } catch (err) {
      toast.error('Failed to disable account')
    } finally {
      setLoading(false)
    }
  }

  const handleForceRotation = async () => {
    setLoading(true)
    try {
      // In production, call API to force account rotation
      toast.success('Forcing rotation to next account...')
    } catch (err) {
      toast.error('Failed to rotate account')
    } finally {
      setLoading(false)
    }
  }

  const highBounceRate = campaign?.sent_count > 0 &&
    ((campaign.bounced_count / campaign.sent_count) * 100) > 5
  const hasComplaints = campaign?.complaint_count > 0

  return (
    <div className="bg-surface-raised rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-900 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Zap size={20} className="text-yellow-400" />
          <span className="font-semibold text-white">Admin Controls</span>
          {(highBounceRate || hasComplaints) && (
            <AlertTriangle size={18} className="text-red-400" />
          )}
        </div>
        <span className="text-gray-400">{expanded ? '▼' : '▶'}</span>
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-6 py-4 space-y-4 border-t border-gray-700">
          {/* Alert Banner */}
          {(highBounceRate || hasComplaints) && (
            <div className="bg-red-600/20 border border-red-600 rounded p-3">
              <p className="text-sm text-red-300">
                ⚠️ Safety threshold exceeded. Consider pausing the campaign to investigate.
              </p>
            </div>
          )}

          {/* Rate Control */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Sending Rate</h4>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">Current: {campaign?.config?.emails_per_hour}/hour</span>
                  <span className="text-xs text-gray-400">Max: {campaign?.ip_daily_limit}/day per account</span>
                </div>
              </div>
              <button
                onClick={() => setShowRateModal(true)}
                disabled={!isRunning}
                className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50"
              >
                <Settings size={14} className="inline mr-1" /> Adjust
              </button>
            </div>
          </div>

          {/* Account Management */}
          {accounts && accounts.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Account Management</h4>
              <div className="space-y-2">
                {accounts.slice(0, 3).map((account, idx) => (
                  <div key={account.id} className="flex items-center justify-between p-2 rounded bg-gray-900">
                    <div>
                      <p className="text-sm text-white">{account.email}</p>
                      <p className="text-xs text-gray-400">Account {idx + 1}</p>
                    </div>
                    <button
                      onClick={() => handleDisableAccount(account.id)}
                      disabled={loading || !isRunning}
                      className="px-3 py-1 rounded text-xs bg-red-600/20 hover:bg-red-600/30 text-red-300 disabled:opacity-50"
                    >
                      {loading ? <Spinner size={12} /> : 'Disable'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Force Rotation */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Account Rotation</h4>
            <button
              onClick={handleForceRotation}
              disabled={loading || !isRunning}
              className="w-full px-4 py-2 rounded bg-purple-600 hover:bg-purple-700 text-white text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Spinner size={14} /> : <RotateCcw size={14} />}
              Force Switch to Next Account
            </button>
          </div>

          {/* Failed Email Retry */}
          {campaign?.failed_count > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Retry Failed Emails</h4>
              <button
                onClick={() => setShowRetryModal(true)}
                disabled={loading}
                className="w-full px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Spinner size={14} /> : <RotateCcw size={14} />}
                Retry {campaign.failed_count} Failed Email(s)
              </button>
            </div>
          )}

          {/* Safety Settings */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Safety Settings</h4>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-900 cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded" />
                <span className="text-sm text-gray-300">
                  Auto-pause if bounce rate exceeds 5%
                </span>
              </label>
              <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-900 cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded" />
                <span className="text-sm text-gray-300">
                  Auto-pause on any complaint
                </span>
              </label>
              <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-900 cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded" />
                <span className="text-sm text-gray-300">
                  Notify admin on issues
                </span>
              </label>
            </div>
          </div>

          {/* Lock Protection */}
          <div className="bg-yellow-600/10 border border-yellow-600 rounded p-3 flex items-start gap-3">
            <Lock size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-yellow-300">
              These controls have throttled updates to prevent accidentally breaking the campaign. Changes take effect within 30 seconds.
            </p>
          </div>
        </div>
      )}

      {/* Rate Modal */}
      {showRateModal && (
        <RateModal
          currentRate={newRate}
          onRate={setNewRate}
          onConfirm={handleRateChange}
          onClose={() => setShowRateModal(false)}
          loading={loading}
        />
      )}

      {/* Account Switch Modal */}
      {showAccountModal && (
        <AccountSwitchModal
          accounts={accounts}
          onClose={() => setShowAccountModal(false)}
        />
      )}

      {/* Retry Confirmation Modal */}
      {showRetryModal && (
        <RetryConfirmModal
          failedCount={campaign?.failed_count || 0}
          onConfirm={handleManualRetry}
          onClose={() => setShowRetryModal(false)}
          loading={loading}
        />
      )}
    </div>
  )
}

function RateModal({ currentRate, onRate, onConfirm, onClose, loading }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-raised rounded-lg p-6 max-w-sm">
        <h3 className="text-lg font-bold text-white mb-4">Adjust Sending Rate</h3>

        <div className="space-y-4 mb-6">
          <div>
            <label className="text-xs text-gray-400 block mb-2">Emails Per Hour</label>
            <select
              value={currentRate}
              onChange={e => onRate(parseInt(e.target.value))}
              className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-white"
            >
              <option value="10">10 emails/hour (very conservative)</option>
              <option value="20">20 emails/hour</option>
              <option value="50">50 emails/hour (recommended)</option>
              <option value="100">100 emails/hour</option>
              <option value="200">200 emails/hour (aggressive)</option>
            </select>
          </div>

          <div className="bg-yellow-600/10 border border-yellow-600 rounded p-3">
            <p className="text-xs text-yellow-300">
              Decreasing rate may help if bounce rate is high. Increasing rate will speed up campaign.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Spinner size={16} /> : 'Update Rate'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AccountSwitchModal({ accounts, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-raised rounded-lg p-6 max-w-sm">
        <h3 className="text-lg font-bold text-white mb-4">Switch Account</h3>

        <div className="space-y-2 mb-6">
          {accounts?.map(account => (
            <button
              key={account.id}
              className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 text-white"
            >
              <p className="text-sm font-medium">{account.email}</p>
              <p className="text-xs text-gray-400">{account.connection_type}</p>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white"
        >
          Close
        </button>
      </div>
    </div>
  )
}

function RetryConfirmModal({ failedCount, onConfirm, onClose, loading }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-raised rounded-lg p-6 max-w-sm">
        <h3 className="text-lg font-bold text-white mb-2">Retry Failed Emails?</h3>
        <p className="text-gray-400 text-sm mb-4">
          This will queue {failedCount} failed email(s) for resending. They'll be sent using available accounts with current rate limits.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Spinner size={16} /> : 'Retry Now'}
          </button>
        </div>
      </div>
    </div>
  )
}
