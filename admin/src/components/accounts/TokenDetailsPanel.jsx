import { useState, useEffect } from 'react'
import { ChevronDown, Copy, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import Spinner from '../ui/Spinner'
import { API_BASE } from '../../api/client'

function TokenDetailsPanel({ accountId, email }) {
  const [expanded, setExpanded] = useState(false)
  const [diagnostics, setDiagnostics] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (expanded && !diagnostics) {
      fetchDiagnostics()
    }
  }, [expanded])

  const fetchDiagnostics = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/accounts/${accountId}/token-diagnostic`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      })
      const data = await response.json()
      if (data.success) {
        setDiagnostics(data.diagnostics)
      } else {
        setError(data.error || 'Failed to load diagnostics')
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch diagnostics')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied!')
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getDaysLeft = (iso) => {
    if (!iso) return null
    const d = new Date(iso)
    const now = new Date()
    return Math.floor((d - now) / (1000 * 60 * 60 * 24))
  }

  const getStatusColor = (days) => {
    if (days === null) return 'gray'
    if (days < 0) return 'red'
    if (days === 0) return 'yellow'
    if (days <= 7) return 'yellow'
    if (days <= 30) return 'orange'
    return 'green'
  }

  const StatusBadge = ({ label, value, color = 'gray' }) => {
    const colors = {
      green: 'bg-green-500/20 text-green-300 border-green-500/30',
      yellow: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      orange: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      red: 'bg-red-500/20 text-red-300 border-red-500/30',
      blue: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      gray: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    }
    return (
      <div className={`px-3 py-2 rounded border ${colors[color]} text-xs`}>
        <p className="font-medium">{label}</p>
        <p className="text-[11px] opacity-80 mt-0.5">{value}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Expand button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-2 rounded text-[11px] font-medium bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors w-full justify-between"
      >
        <span>Token Debug Info</span>
        <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Details panel */}
      {expanded && (
        <div className="bg-surface-raised rounded-lg border border-surface-border p-4 space-y-4 text-sm">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Spinner size={20} />
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 flex gap-2">
              <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-red-300 text-xs">{error}</div>
            </div>
          )}

          {diagnostics && !loading && (
            <div className="space-y-4">
              {/* Access Token Status */}
              <div className="space-y-2">
                <h4 className="font-medium text-white flex items-center gap-2">
                  <span>🔑 Access Token</span>
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <StatusBadge
                    label="Status"
                    value={diagnostics.tokens.access_token.is_expired ? 'Expired' : 'Valid'}
                    color={diagnostics.tokens.access_token.is_expired ? 'red' : 'green'}
                  />
                  <StatusBadge
                    label="Encrypted"
                    value={diagnostics.tokens.access_token.encrypted}
                    color={diagnostics.tokens.access_token.encrypted === 'yes' ? 'green' : 'red'}
                  />
                  <StatusBadge
                    label="Expires At"
                    value={formatDate(diagnostics.tokens.access_token.expires_at)}
                  />
                  <StatusBadge
                    label="Minutes Until Expiry"
                    value={diagnostics.tokens.access_token.minutes_until_expiry}
                    color={
                      diagnostics.tokens.access_token.minutes_until_expiry < 5
                        ? 'red'
                        : diagnostics.tokens.access_token.minutes_until_expiry < 30
                        ? 'yellow'
                        : 'green'
                    }
                  />
                </div>
              </div>

              {/* Refresh Token Status */}
              <div className="space-y-2">
                <h4 className="font-medium text-white flex items-center gap-2">
                  <span>🔄 Refresh Token</span>
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <StatusBadge
                    label="Status"
                    value={diagnostics.tokens.refresh_token.is_expired ? 'Expired' : 'Valid'}
                    color={diagnostics.tokens.refresh_token.is_expired ? 'red' : 'green'}
                  />
                  <StatusBadge
                    label="Encrypted"
                    value={diagnostics.tokens.refresh_token.encrypted}
                    color={diagnostics.tokens.refresh_token.encrypted === 'yes' ? 'green' : 'red'}
                  />
                  <StatusBadge
                    label="Expires At"
                    value={formatDate(diagnostics.tokens.refresh_token.expires_at)}
                  />
                  <StatusBadge
                    label="Days Until Expiry"
                    value={diagnostics.tokens.refresh_token.days_until_expiry ?? '—'}
                    color={getStatusColor(diagnostics.tokens.refresh_token.days_until_expiry)}
                  />
                </div>
                <p className="text-[10px] text-gray-500">
                  Last refresh: {diagnostics.tokens.last_refresh}
                </p>
              </div>

              {/* Scopes */}
              <div className="space-y-2">
                <h4 className="font-medium text-white">📋 Scopes</h4>
                <div className="bg-gray-900/50 rounded p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {diagnostics.scopes.has_offline_access ? (
                      <CheckCircle2 size={14} className="text-green-400 flex-shrink-0" />
                    ) : (
                      <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                    )}
                    <span className={`text-xs ${diagnostics.scopes.has_offline_access ? 'text-green-300' : 'text-red-300'}`}>
                      {diagnostics.scopes.offline_access_critical}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400 space-y-1">
                    <p><strong>Stored:</strong> {diagnostics.scopes.stored_scopes.join(', ') || 'None'}</p>
                    {diagnostics.scopes.missing_scopes.length > 0 && (
                      <p className="text-yellow-300">
                        <strong>Missing:</strong> {diagnostics.scopes.missing_scopes.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* OAuth Config */}
              <div className="space-y-2">
                <h4 className="font-medium text-white">⚙️ OAuth Config</h4>
                <div className="grid grid-cols-2 gap-2 text-[10px] bg-gray-900/50 rounded p-3">
                  <div>
                    <p className="text-gray-500">Client ID</p>
                    <p className={diagnostics.oauth_config.client_id.has_value ? 'text-green-300' : 'text-red-300'}>
                      {diagnostics.oauth_config.client_id.value_preview}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Client Secret</p>
                    <p className={diagnostics.oauth_config.client_secret.has_value ? 'text-green-300' : 'text-red-300'}>
                      {diagnostics.oauth_config.client_secret.has_value ? '●●●●●●●●' : 'Missing'}
                    </p>
                  </div>
                  <div colSpan={2}>
                    <p className="text-gray-500">Tenant ID</p>
                    <p className="text-blue-300 font-mono">{diagnostics.oauth_config.tenant_id}</p>
                  </div>
                </div>
              </div>

              {/* Issues & Recommendations */}
              {diagnostics.issues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-white flex items-center gap-2">
                    <AlertTriangle size={14} className="text-red-400" />
                    Issues ({diagnostics.issues.length})
                  </h4>
                  <div className="space-y-2">
                    {diagnostics.issues.map((issue, idx) => (
                      <div key={idx} className="bg-red-500/10 border border-red-500/30 rounded p-3">
                        <p className="font-medium text-red-300 text-xs mb-1">{issue.issue}</p>
                        <p className="text-red-200/70 text-[10px]">{issue.cause}</p>
                        <p className="text-red-200/60 text-[10px] mt-1">💡 {issue.fix}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diagnostics.recommendations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-white">📌 Recommendations</h4>
                  <div className="space-y-2">
                    {diagnostics.recommendations.map((rec, idx) => {
                      const colors = {
                        urgent: 'bg-red-500/10 border-red-500/30 text-red-300',
                        high: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300',
                        medium: 'bg-orange-500/10 border-orange-500/30 text-orange-300',
                        info: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
                      }
                      return (
                        <div key={idx} className={`border rounded p-3 ${colors[rec.priority]}`}>
                          <p className="font-medium text-xs mb-0.5">{rec.action}</p>
                          <p className="text-[10px] opacity-80">{rec.reason}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {diagnostics.failure_tracking && (
                <div className="space-y-2">
                  <h4 className="font-medium text-white">📊 Refresh Tracking</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <StatusBadge
                      label="Failed Count"
                      value={diagnostics.failure_tracking.refresh_failed_count}
                      color={
                        diagnostics.failure_tracking.refresh_failed_count >= 3 ? 'red'
                          : diagnostics.failure_tracking.refresh_failed_count > 0 ? 'yellow'
                          : 'green'
                      }
                    />
                    <StatusBadge
                      label="Last Attempt"
                      value={diagnostics.failure_tracking.last_refresh_attempt_at || '—'}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default TokenDetailsPanel
