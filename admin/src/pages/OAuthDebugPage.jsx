import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, Loader, Copy, RefreshCw } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'
import toast from 'react-hot-toast'

/**
 * OAuth Redirect Debug & Verification Page
 *
 * Shows:
 * - Status (loading, success, error)
 * - All query parameters received
 * - Raw request data
 * - Error details
 * - Action buttons
 */
export default function OAuthDebugPage() {
  const [searchParams] = useSearchParams()
  const [expandedSections, setExpandedSections] = useState({
    params: true,
    status: true,
    error: false,
  })

  const status = searchParams.get('status')
  const error = searchParams.get('error')
  const message = searchParams.get('message')
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const accountId = searchParams.get('account_id')
  const email = searchParams.get('email')
  const errorDescription = searchParams.get('error_description')

  // Collect all query params
  const allParams = Object.fromEntries(searchParams.entries())

  // Log everything for debugging
  useEffect(() => {
    console.log('OAuth Debug Page - Query Params:', {
      status,
      error,
      message,
      code: code ? `${code.substring(0, 20)}...` : null,
      state: state ? `${state.substring(0, 20)}...` : null,
      accountId,
      email,
      allParams,
    })
  }, [status, error, message, code, state, accountId, email, allParams])

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const getStatusColor = () => {
    if (status === 'success') return 'bg-green-500/10 border-green-500/20'
    if (error) return 'bg-red-500/10 border-red-500/20'
    return 'bg-blue-500/10 border-blue-500/20'
  }

  const getStatusIcon = () => {
    if (status === 'success') return <CheckCircle2 size={48} className="text-green-400" />
    if (error) return <AlertTriangle size={48} className="text-red-400" />
    return <Loader size={48} className="text-blue-400 animate-spin" />
  }

  const getStatusText = () => {
    if (status === 'success') return '✅ Success!'
    if (error) return '❌ Authorization Failed'
    return '⏳ Processing...'
  }

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gradient-to-br from-surface-base to-surface-raised p-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Header */}
          <div className="text-center space-y-2 mb-8">
            <h1 className="text-4xl font-bold text-white">OAuth Verification</h1>
            <p className="text-gray-400">Debug and verify Microsoft OAuth redirect</p>
          </div>

          {/* Status Card */}
          <div className={`rounded-lg border ${getStatusColor()} p-8`}>
            <div className="flex flex-col items-center gap-4">
              <div>{getStatusIcon()}</div>
              <h2 className="text-3xl font-bold text-white">{getStatusText()}</h2>
              {message && (
                <p className="text-gray-300 text-center max-w-2xl">{decodeURIComponent(message)}</p>
              )}
            </div>
          </div>

          {/* Success Details */}
          {status === 'success' && (
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-6 space-y-4">
              <h3 className="text-lg font-bold text-green-400">✅ Account Connected Successfully</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-raised rounded p-4">
                  <p className="text-xs text-gray-400 mb-1">Email</p>
                  <p className="text-sm font-mono text-gray-200">{email || '—'}</p>
                </div>
                <div className="bg-surface-raised rounded p-4">
                  <p className="text-xs text-gray-400 mb-1">Account ID</p>
                  <p className="text-sm font-mono text-gray-200">{accountId || '—'}</p>
                </div>
              </div>
              <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded text-sm text-blue-300">
                ℹ️ Your tokens have been encrypted and saved to the database. You can now use this account for bulk email operations.
              </div>
            </div>
          )}

          {/* Error Details */}
          {error && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-6 space-y-4">
              <h3 className="text-lg font-bold text-red-400">❌ Authorization Failed</h3>

              <div className="space-y-2">
                <div className="bg-surface-raised rounded p-4">
                  <p className="text-xs text-gray-400 mb-1">Error Code</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-mono text-red-300">{error}</p>
                    <button
                      onClick={() => copyToClipboard(error)}
                      className="p-1 hover:bg-surface-border rounded"
                      title="Copy"
                    >
                      <Copy size={14} className="text-gray-400" />
                    </button>
                  </div>
                </div>

                {errorDescription && (
                  <div className="bg-surface-raised rounded p-4">
                    <p className="text-xs text-gray-400 mb-1">Error Description</p>
                    <p className="text-sm text-gray-300">{decodeURIComponent(errorDescription)}</p>
                  </div>
                )}
              </div>

              {/* Common Error Solutions */}
              <div className="mt-6 space-y-3">
                <p className="text-sm font-semibold text-gray-300">Common causes:</p>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li className="flex gap-2">
                    <span className="text-red-400">•</span>
                    <span><strong>invalid_request:</strong> Redirect URI mismatch or code expired</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-red-400">•</span>
                    <span><strong>invalid_client:</strong> Client ID or Secret is incorrect</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-red-400">•</span>
                    <span><strong>access_denied:</strong> User denied access or didn't complete login</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-red-400">•</span>
                    <span><strong>state_expired:</strong> Authorization took too long (10-minute timeout)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-red-400">•</span>
                    <span><strong>AADSTS:</strong> Azure-specific error - check permissions and tenant ID</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Query Parameters Section */}
          <div className="border border-surface-border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('params')}
              className="w-full px-6 py-4 bg-surface-raised hover:bg-surface-raised/80 flex items-center justify-between cursor-pointer"
            >
              <span className="font-semibold text-white">📋 Query Parameters</span>
              <span className="text-gray-400">{expandedSections.params ? '▼' : '▶'}</span>
            </button>

            {expandedSections.params && (
              <div className="bg-surface-base p-6 border-t border-surface-border space-y-3 max-h-96 overflow-y-auto">
                {Object.entries(allParams).length === 0 ? (
                  <p className="text-gray-400 text-sm">No query parameters received</p>
                ) : (
                  Object.entries(allParams).map(([key, value]) => (
                    <div key={key} className="bg-surface-raised rounded p-3">
                      <p className="text-xs text-gray-400 mb-1">{key}</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-mono text-gray-300 break-all">
                          {value.length > 100 ? value.substring(0, 100) + '...' : value}
                        </p>
                        <button
                          onClick={() => copyToClipboard(value)}
                          className="p-1 hover:bg-surface-border rounded flex-shrink-0"
                          title="Copy"
                        >
                          <Copy size={14} className="text-gray-400" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Status Info Section */}
          <div className="border border-surface-border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('status')}
              className="w-full px-6 py-4 bg-surface-raised hover:bg-surface-raised/80 flex items-center justify-between cursor-pointer"
            >
              <span className="font-semibold text-white">📊 Status Information</span>
              <span className="text-gray-400">{expandedSections.status ? '▼' : '▶'}</span>
            </button>

            {expandedSections.status && (
              <div className="bg-surface-base p-6 border-t border-surface-border space-y-3">
                <div className="bg-surface-raised rounded p-4">
                  <p className="text-xs text-gray-400 mb-2">Overall Status</p>
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      status === 'success' ? 'bg-green-500' : error ? 'bg-red-500' : 'bg-blue-500'
                    }`} />
                    <span className="font-mono text-sm text-gray-200">
                      {status === 'success' ? '✅ SUCCESS' : error ? '❌ ERROR' : '⏳ PROCESSING'}
                    </span>
                  </div>
                </div>

                {code && (
                  <div className="bg-surface-raised rounded p-4">
                    <p className="text-xs text-gray-400 mb-2">Authorization Code Received</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-green-400">✓ Code present</span>
                      <span className="text-xs text-gray-500">({code.length} chars)</span>
                    </div>
                  </div>
                )}

                {state && (
                  <div className="bg-surface-raised rounded p-4">
                    <p className="text-xs text-gray-400 mb-2">State Parameter</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-green-400">✓ State present</span>
                      <span className="text-xs text-gray-500">({state.length} chars)</span>
                    </div>
                  </div>
                )}

                <div className="bg-blue-500/10 border border-blue-500/20 rounded p-4 text-xs text-blue-300">
                  <p className="font-semibold mb-2">ℹ️ Flow Info</p>
                  <ul className="space-y-1">
                    <li>• Redirect from: Microsoft OAuth Server</li>
                    <li>• Redirect to: {window.location.href.split('?')[0]}</li>
                    <li>• Timestamp: {new Date().toISOString()}</li>
                    <li>• Browser: {navigator.userAgent.substring(0, 60)}...</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Raw Data Section */}
          <div className="border border-surface-border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('error')}
              className="w-full px-6 py-4 bg-surface-raised hover:bg-surface-raised/80 flex items-center justify-between cursor-pointer"
            >
              <span className="font-semibold text-white">🔧 Raw Data (for support)</span>
              <span className="text-gray-400">{expandedSections.error ? '▼' : '▶'}</span>
            </button>

            {expandedSections.error && (
              <div className="bg-surface-base p-6 border-t border-surface-border">
                <div className="bg-gray-900 rounded p-4 font-mono text-xs text-gray-300 max-h-48 overflow-auto">
                  <pre className="whitespace-pre-wrap break-words">
                    {JSON.stringify({
                      url: window.location.href,
                      params: allParams,
                      timestamp: new Date().toISOString(),
                    }, null, 2)}
                  </pre>
                </div>
                <button
                  onClick={() => copyToClipboard(JSON.stringify({ url: window.location.href, params: allParams }, null, 2))}
                  className="mt-3 w-full px-4 py-2 bg-surface-raised hover:bg-surface-raised/80 border border-surface-border rounded text-sm text-gray-300 flex items-center justify-center gap-2"
                >
                  <Copy size={16} />
                  Copy Raw Data
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <a
              href="/admin/accounts"
              className="flex-1 px-6 py-3 bg-brand text-white rounded-lg font-medium hover:bg-brand/90 text-center"
            >
              Back to Accounts
            </a>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-surface-raised text-gray-300 rounded-lg font-medium hover:bg-surface-raised/80 flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} />
              Reload
            </button>
          </div>

          {/* Help Section */}
          <div className="bg-surface-raised rounded-lg p-6 border border-surface-border">
            <h3 className="font-semibold text-white mb-3">🆘 Debugging Help</h3>
            <div className="space-y-2 text-sm text-gray-400">
              <p>
                <strong>If you see an error:</strong> Check the "Query Parameters" section above to see what Microsoft sent back. Common issues include redirect URI mismatch or incorrect credentials.
              </p>
              <p>
                <strong>If you're stuck:</strong> Take a screenshot of this page and copy the "Raw Data" section. This contains all the information needed to debug the OAuth flow.
              </p>
              <p>
                <strong>Need help?</strong> Check the backend logs at <code className="text-gray-500">storage/logs/laravel-*.log</code> for detailed error messages.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
