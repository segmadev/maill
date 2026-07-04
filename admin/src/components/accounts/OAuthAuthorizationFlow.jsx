import { useState, useEffect, useRef } from 'react'
import { AlertCircle, CheckCircle2, Copy, ExternalLink, RefreshCw, Lock, Eye, EyeOff, Clock, Loader, Plus, X, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import Badge from '../ui/Badge'
import { startOAuthAuthorization, refreshAccountToken } from '../../api/admin'

/**
 * FIXED OAuth 2.0 Authorization Code Flow
 *
 * FIXED: Opens authorization in a NEW WINDOW instead of redirecting away
 * This keeps the modal open and allows it to detect when account is added
 *
 * User flow:
 * 1. Admin enters Client ID, Secret, Tenant ID, Email
 * 2. Admin clicks "Generate Authorization URL"
 * 3. System generates a link with 10-minute timeout
 * 4. Admin clicks "Click to Authorize" → Opens in NEW WINDOW
 * 5. User logs into Microsoft in the new window
 * 6. User authorizes app
 * 7. Backend saves account automatically
 * 8. Modal DETECTS the account was added (via polling)
 * 9. Modal shows success message
 * 10. User closes modal
 */
export default function OAuthAuthorizationFlow({ open, onClose, onSuccess }) {
  const [step, setStep] = useState('form') // 'form', 'url', 'waiting', 'success'
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const authWindowRef = useRef(null)
  const pollingIntervalRef = useRef(null)

  // Form data
  const [form, setForm] = useState({
    client_id: '',
    client_secret: '',
    tenant_id: 'common',
    email: '',
  })

  // Scopes selection
  const [availableScopes] = useState([
    { value: 'Mail.Read', label: 'Mail.Read - Read emails', checked: true, custom: false },
    { value: 'Mail.Send', label: 'Mail.Send - Send emails', checked: true, custom: false },
    { value: 'Mail.ReadWrite', label: 'Mail.ReadWrite - Read & write emails', checked: true, custom: false },
    { value: 'offline_access', label: 'offline_access - Refresh token', checked: true, custom: false },
    { value: 'User.Read', label: 'User.Read - Read profile', checked: false, custom: false },
  ])
  const [selectedScopes, setSelectedScopes] = useState(availableScopes)
  const [customScopeInput, setCustomScopeInput] = useState('')
  const [collapsibles, setCollapsibles] = useState({
    verifyCredentials: false,
  })

  // Authorization URL state
  const [authUrl, setAuthUrl] = useState(null)
  const [state, setState] = useState(null)
  const [expiresAt, setExpiresAt] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(0)

  // Token state (after callback)
  const [tokenData, setTokenData] = useState(null)
  const [showTokens, setShowTokens] = useState(false)

  // Error state
  const [errorData, setErrorData] = useState(null)

  // Timer for URL expiration
  useEffect(() => {
    if (!expiresAt) return

    const timer = setInterval(() => {
      const diff = Math.round((new Date(expiresAt) - Date.now()) / 1000)
      setTimeRemaining(Math.max(0, diff))

      if (diff <= 0) {
        clearInterval(timer)
        setAuthUrl(null)
        setState(null)
        toast.error('Authorization URL expired. Please generate a new one.')
        setStep('form')
        stopPolling()
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [expiresAt])

  // Cleanup on modal close
  useEffect(() => {
    if (!open) {
      stopPolling()
      if (authWindowRef.current && !authWindowRef.current.closed) {
        authWindowRef.current.close()
      }
    }
  }, [open])

  const handleFormChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleAddCustomScope = () => {
    const trimmedScope = customScopeInput.trim()

    if (!trimmedScope) {
      toast.error('Please enter a scope')
      return
    }

    // Check if scope already exists
    if (selectedScopes.some(s => s.value === trimmedScope)) {
      toast.error('This scope already exists')
      return
    }

    // Add custom scope
    const newScope = {
      value: trimmedScope,
      label: `${trimmedScope} (custom)`,
      checked: true,
      custom: true
    }

    setSelectedScopes([...selectedScopes, newScope])
    setCustomScopeInput('')
    toast.success('Custom scope added')
  }

  const handleRemoveCustomScope = (value) => {
    setSelectedScopes(selectedScopes.filter(s => s.value !== value))
  }

  const toggleCollapsible = (key) => {
    setCollapsibles(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleGenerateUrl = async (e) => {
    e.preventDefault()

    // Validate
    if (!form.client_id || !form.client_secret || !form.tenant_id || !form.email) {
      toast.error('Please fill in all fields')
      return
    }

    setLoading(true)
    try {
      // Get selected scopes
      const scopes = selectedScopes
        .filter(s => s.checked)
        .map(s => s.value)

      if (scopes.length === 0) {
        toast.error('Please select at least one scope')
        setLoading(false)
        return
      }

      // Generate authorization URL with all credentials
      const result = await startOAuthAuthorization({
        client_id: form.client_id,
        client_secret: form.client_secret,
        tenant_id: form.tenant_id,
        email: form.email,
        scopes: scopes,
      })

      setAuthUrl(result.url)
      setState(result.state)
      setExpiresAt(result.expires_at)
      setErrorData(null) // Clear any previous errors
      setStep('url')
      toast.success('Authorization URL generated! (10-minute timeout)')
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to generate authorization URL')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(authUrl)
    toast.success('URL copied to clipboard')
  }

  /**
   * FIXED: Open authorization in a NEW WINDOW instead of redirecting
   * This keeps the modal open and allows polling to detect when account is added
   */
  const handleOpenUrl = () => {
    // Close any existing window
    if (authWindowRef.current && !authWindowRef.current.closed) {
      authWindowRef.current.close()
    }

    // Open in new window (user can minimize/switch tabs)
    authWindowRef.current = window.open(authUrl, 'oauth-authorization', 'width=500,height=700')

    if (!authWindowRef.current) {
      toast.error('Popup blocked! Please allow popups and try again.')
      return
    }

    toast.success('Authorization window opened. Complete the login process there.')

    // Don't auto-poll - user will click "Check Status" button
    setStep('waiting')
  }

  /**
   * FIXED: Poll backend to detect when the OAuth callback succeeds
   * Check if a new account was added matching the email
   */
  const startPolling = () => {
    let pollAttempts = 0
    const maxAttempts = 120 // 2 minutes (poll every second)

    console.log('🔍 Starting OAuth polling for email:', form.email)

    pollingIntervalRef.current = setInterval(async () => {
      pollAttempts++

      // Give up after 2 minutes
      if (pollAttempts > maxAttempts) {
        console.error('❌ Polling timeout after', maxAttempts, 'attempts')
        stopPolling()
        toast.error('Authorization timeout. Please try again.')
        setStep('url')
        return
      }

      try {
        // Get auth token from localStorage
        const authData = localStorage.getItem('admin-auth')
        let authToken = ''
        try {
          const parsed = JSON.parse(authData)
          authToken = parsed.token
        } catch (e) {
          const token = authData?.split('token":"')[1]?.split('"')[0]
          if (token) authToken = token
        }

        // FIRST: Check for OAuth errors/results
        const statusResponse = await fetch(`http://localhost:8765/api/admin/oauth-status?state=${encodeURIComponent(state)}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
        })
        const statusResult = await statusResponse.json()

        console.log(`Poll attempt ${pollAttempts}: OAuth status =`, statusResult.success)

        // Check if there's an error from callback
        if (statusResult.success === false) {
          // Error occurred during callback
          console.error('❌ OAuth error detected:', statusResult.message)
          stopPolling()
          setErrorData(statusResult)
          setStep('error')
          toast.error(`❌ ${statusResult.message}`)
          return
        }

        // SECOND: Check if account was added
        const accountsResponse = await fetch('http://localhost:8765/api/admin/accounts', {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
        })
        const accountsResult = await accountsResponse.json()

        console.log(`Poll attempt ${pollAttempts}: Found ${accountsResult.data?.length || 0} accounts`)

        // Look for account matching the email we're adding (case-insensitive)
        if (accountsResult.data && Array.isArray(accountsResult.data)) {
          const emailLower = form.email.toLowerCase().trim()

          // Debug: log all accounts and what we're searching for
          console.log('🔍 Searching for email:', emailLower)
          console.log('📧 Available accounts:', accountsResult.data.map(acc => acc.email?.toLowerCase().trim()))

          const newAccount = accountsResult.data.find(acc =>
            acc.email && acc.email.toLowerCase().trim() === emailLower
          )

          if (newAccount) {
            // Account found! Authorization succeeded
            console.log('✅ Account found!', newAccount.email)
            stopPolling()
            setTokenData(newAccount)
            setStep('success')

            // Close the auth window if still open
            if (authWindowRef.current && !authWindowRef.current.closed) {
              authWindowRef.current.close()
            }

            toast.success('✅ Account connected successfully!')

            // Call onSuccess callback to refresh accounts list
            if (onSuccess) {
              onSuccess(newAccount)
            }

            // Exit early - don't continue polling
            return
          }
        }
      } catch (error) {
        console.error(`Poll attempt ${pollAttempts}: Error:`, error)
        // Continue polling on error
      }
    }, 1000) // Poll every second
  }

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
  }

  const handleManualRefresh = async () => {
    if (!tokenData?.id) {
      toast.error('Account not found')
      return
    }

    setRefreshing(true)
    try {
      const result = await refreshAccountToken(tokenData.id)
      setTokenData(prev => ({
        ...prev,
        token_expires_at: result.account.token_expires_at,
        minutes_remaining: result.account.minutes_remaining,
        last_refresh_attempt_at: result.account.last_refresh_attempt_at,
      }))
      toast.success('Token refreshed successfully')
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to refresh token')
    } finally {
      setRefreshing(false)
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDateTime = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  // When used inside ConnectAccountModal, just return content (no Modal wrapper)
  // When used standalone, the parent handles the Modal
  const content = (
    <div className="space-y-6">

        {/* STEP 1: Form */}
        {step === 'form' && (
          <form onSubmit={handleGenerateUrl} className="space-y-4">
            {/* Collapsible Verify Credentials */}
            <div className="border border-yellow-500/20 rounded-lg bg-yellow-500/5">
              <button
                type="button"
                onClick={() => toggleCollapsible('verifyCredentials')}
                className="w-full px-3 py-2 flex items-center justify-between text-sm text-yellow-300 hover:bg-yellow-500/10"
              >
                <span className="font-semibold">⚠️ Verify Your Credentials</span>
                <ChevronDown size={16} className={`transition ${collapsibles.verifyCredentials ? 'rotate-180' : ''}`} />
              </button>
              {collapsibles.verifyCredentials && (
                <div className="px-3 py-3 bg-yellow-500/10 border-t border-yellow-500/20 space-y-2 text-xs text-yellow-300">
                  <p>Make sure your Client ID and Secret match exactly what's in Azure:</p>
                  <ol className="ml-4 space-y-0.5 list-decimal">
                    <li>Go to portal.azure.com → App Registrations → Your App</li>
                    <li>Copy Client ID from "Overview" tab</li>
                    <li>Copy Secret from "Certificates & Secrets" (NOT expired!)</li>
                    <li>Verify Redirect URI is registered</li>
                  </ol>
                </div>
              )}
            </div>

            <p className="text-sm text-gray-400">
              Enter your Microsoft Azure app credentials to generate an authorization URL.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Client ID *</label>
              <input
                type="text"
                name="client_id"
                value={form.client_id}
                onChange={handleFormChange}
                placeholder="Enter Client ID"
                className="w-full px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Tenant ID *</label>
              <input
                type="text"
                name="tenant_id"
                value={form.tenant_id}
                onChange={handleFormChange}
                placeholder="common or your tenant ID"
                className="w-full px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Client Secret *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="client_secret"
                  value={form.client_secret}
                  onChange={handleFormChange}
                  placeholder="Enter Client Secret"
                  className="w-full px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Outlook Email *</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleFormChange}
                placeholder="user@outlook.com"
                className="w-full px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Request Scopes</label>
              <div className="space-y-3">
                {/* Predefined Scopes */}
                <div className="space-y-2 bg-surface-raised rounded-lg p-3 border border-surface-border max-h-48 overflow-y-auto">
                  {selectedScopes.filter(s => !s.custom).map((scope) => (
                    <label key={scope.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scope.checked}
                        onChange={(e) => {
                          setSelectedScopes(
                            selectedScopes.map((s) =>
                              s.value === scope.value ? { ...s, checked: e.target.checked } : s
                            )
                          )
                        }}
                        className="w-4 h-4 rounded border-gray-400"
                      />
                      <span className="text-sm text-gray-300">{scope.label}</span>
                    </label>
                  ))}

                  {/* Custom Scopes */}
                  {selectedScopes.filter(s => s.custom).length > 0 && (
                    <>
                      <div className="border-t border-surface-border pt-2 mt-2" />
                      {selectedScopes.filter(s => s.custom).map((scope) => (
                        <div key={scope.value} className="flex items-center gap-2">
                          <label className="flex items-center gap-2 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={scope.checked}
                              onChange={(e) => {
                                setSelectedScopes(
                                  selectedScopes.map((s) =>
                                    s.value === scope.value ? { ...s, checked: e.target.checked } : s
                                  )
                                )
                              }}
                              className="w-4 h-4 rounded border-gray-400"
                            />
                            <span className="text-sm text-amber-400">{scope.value}</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomScope(scope.value)}
                            className="p-1 text-gray-400 hover:text-red-400 hover:bg-surface-raised rounded"
                            title="Remove custom scope"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* Add Custom Scope */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customScopeInput}
                    onChange={(e) => setCustomScopeInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddCustomScope()
                      }
                    }}
                    placeholder="e.g., Calendar.Read, Files.Read"
                    className="flex-1 px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomScope}
                    className="px-3 py-2 bg-surface-raised hover:bg-surface-raised/80 border border-surface-border rounded-lg text-gray-300 hover:text-white transition flex items-center gap-1"
                  >
                    <Plus size={14} />
                    <span className="text-sm">Add</span>
                  </button>
                </div>

                <p className="text-xs text-gray-500">Select which permissions to request from Microsoft. Add custom scopes for additional permissions.</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-brand text-white rounded-lg font-medium hover:bg-brand/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Spinner size={16} />}
              Generate Authorization URL
            </button>
          </form>
        )}

        {/* STEP 2: URL Generated */}
        {step === 'url' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <AlertCircle size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-300">
                <p className="font-medium text-blue-400 mb-1">Ready to authorize!</p>
                <p>Click the button below to open the Microsoft login page in a new window.</p>
              </div>
            </div>

            {/* Expiration Timer */}
            <div className="flex items-center gap-2 px-3 py-2 bg-surface-raised border border-yellow-500/20 rounded-lg">
              <Clock size={16} className="text-yellow-400 flex-shrink-0" />
              <span className="text-sm text-gray-300">
                Expires in: <span className="font-mono font-bold text-yellow-400">{formatTime(timeRemaining)}</span>
              </span>
            </div>

            {/* Authorization URL */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">Authorization URL</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={authUrl}
                  readOnly
                  className="flex-1 px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-white text-sm font-mono overflow-auto"
                />
                <button
                  onClick={handleCopyUrl}
                  className="p-2 hover:bg-surface-raised rounded-lg text-gray-400 hover:text-gray-300"
                  title="Copy URL"
                >
                  <Copy size={18} />
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleOpenUrl}
                className="w-full px-4 py-2 bg-brand text-white rounded-lg font-medium hover:bg-brand/90 flex items-center justify-center gap-2"
              >
                <ExternalLink size={16} />
                Click to Authorize (Opens New Window)
              </button>

              <button
                onClick={() => setStep('form')}
                className="w-full px-4 py-2 bg-surface-raised border border-surface-border text-gray-300 rounded-lg font-medium hover:bg-surface-raised/80"
              >
                Generate New
              </button>
            </div>

            {/* Info Box */}
            <div className="p-3 bg-surface-raised rounded-lg text-sm text-gray-400">
              <p className="font-medium text-gray-300 mb-1">What happens next:</p>
              <ol className="space-y-1 ml-4 list-decimal">
                <li>A new window will open for Microsoft login</li>
                <li>Sign in with your Outlook account</li>
                <li>Click "Accept" to authorize the app</li>
                <li>This modal will automatically detect when you're done</li>
                <li>You'll see a success message here</li>
              </ol>
            </div>

            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-surface-raised text-gray-300 rounded-lg font-medium hover:bg-surface-raised/80"
            >
              Close
            </button>
          </div>
        )}

        {/* STEP 3: Waiting for Authorization - Manual Check */}
        {step === 'waiting' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4 p-6">
              <div className="w-16 h-16 rounded-full bg-blue-500/20 border-2 border-blue-500/40 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-blue-400" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-white mb-2">Complete Authorization in Popup</h3>
                <p className="text-gray-400">Sign in and grant permissions in the popup window</p>
              </div>
            </div>

            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-300">
              <p className="font-semibold mb-2">Steps:</p>
              <ol className="space-y-1 ml-4 list-decimal">
                <li>Sign in with your Outlook account</li>
                <li>Click "Accept" to authorize</li>
                <li>Close the popup window</li>
                <li>Click "Check Status" button below</li>
              </ol>
            </div>

            <button
              onClick={async () => {
                // Manually check if account was added
                try {
                  // Get token from localStorage - check what format it's stored in
                  const authData = localStorage.getItem('admin-auth')
                  console.log('Raw authData from localStorage:', authData)

                  let authToken = ''

                  if (!authData) {
                    console.error('❌ No admin-auth in localStorage!')
                    toast.error('Not logged in. Please log in again.')
                    return
                  }

                  try {
                    // Try parsing as JSON
                    const parsed = JSON.parse(authData)
                    console.log('Parsed auth object:', parsed)
                    // Token is stored in nested structure: state.token
                    authToken = parsed.state?.token || parsed.token || parsed.access_token || ''
                  } catch (e) {
                    // If not JSON, try direct string
                    console.log('Not JSON, trying string extraction')
                    authToken = authData
                  }

                  if (!authToken) {
                    console.error('❌ No token extracted!')
                    toast.error('No auth token found. Please log in again.')
                    return
                  }

                  console.log('Auth token (first 50 chars):', authToken.substring(0, 50) + '...')

                  const accountsResponse = await fetch('http://localhost:8765/api/admin/accounts', {
                    headers: {
                      'Authorization': `Bearer ${authToken}`,
                      'Content-Type': 'application/json',
                    },
                  })

                  console.log('Response status:', accountsResponse.status)
                  console.log('Response OK:', accountsResponse.ok)

                  const accountsResult = await accountsResponse.json()
                  console.log('Full API response:', accountsResult)

                  console.log('📧 Checking for account...')
                  console.log('Search email (from form):', form.email)
                  console.log('Search email (lowercase):', form.email.toLowerCase().trim())

                  // API returns { accounts: [...] } not { data: [...] }
                  const accountsList = accountsResult.accounts || accountsResult.data || []
                  console.log('Available accounts:', accountsList?.map(acc => ({
                    email: acc.email,
                    email_lowercase: acc.email?.toLowerCase().trim()
                  })))

                  if (accountsList && Array.isArray(accountsList)) {
                    const emailLower = form.email.toLowerCase().trim()
                    const newAccount = accountsList.find(acc =>
                      acc.email && acc.email.toLowerCase().trim() === emailLower
                    )

                    if (newAccount) {
                      console.log('✅ Account found!', newAccount)
                      setTokenData(newAccount)
                      setStep('success')
                      toast.success('✅ Account found!')
                      return
                    }

                    // If we get here, account wasn't found
                    console.log('❌ No matching account found')
                  }

                  toast.error('Account not found yet. Please check the popup window and try again.')
                } catch (error) {
                  console.error('Check status error:', error)
                  toast.error('Error checking status. Please try again.')
                }
              }}
              className="w-full px-4 py-2 bg-brand text-white rounded-lg font-medium hover:bg-brand/90 flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} />
              Check Status
            </button>

            <button
              onClick={() => {
                setStep('url')
              }}
              className="w-full px-4 py-2 bg-surface-raised text-gray-300 rounded-lg font-medium hover:bg-surface-raised/80"
            >
              Go Back
            </button>
          </div>
        )}

        {/* STEP 4: Success */}
        {step === 'success' && tokenData && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-300">
                <p className="font-medium text-green-400">Account Connected!</p>
                <p>{tokenData.email}</p>
              </div>
            </div>

            {/* Token Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-surface-raised rounded-lg">
                <p className="text-xs text-gray-400 mb-1">Email</p>
                <p className="text-sm font-medium text-gray-300">{tokenData.email}</p>
              </div>
              <div className="p-3 bg-surface-raised rounded-lg">
                <p className="text-xs text-gray-400 mb-1">Last Updated</p>
                <p className="text-xs font-mono text-gray-300">{formatDateTime(tokenData.last_refresh_attempt_at)}</p>
              </div>
            </div>

            {/* Token Expiration */}
            <div className="p-3 bg-surface-raised rounded-lg">
              <p className="text-xs text-gray-400 mb-1">Token Expires</p>
              <p className="text-sm font-medium text-gray-300 mb-1">{formatDateTime(tokenData.token_expires_at)}</p>
              <p className="text-xs text-gray-400">
                {tokenData.minutes_remaining ? `${tokenData.minutes_remaining} minutes remaining` : '—'}
              </p>
            </div>

            {/* Manual Refresh */}
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {refreshing && <Spinner size={16} />}
              <RefreshCw size={16} />
              Refresh Token
            </button>

            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-brand text-white rounded-lg font-medium hover:bg-brand/90"
            >
              Done
            </button>
          </div>
        )}

        {/* STEP 5: Error State */}
        {step === 'error' && errorData && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-300">
                <p className="font-medium text-red-400">Authorization Failed</p>
                <p className="mt-1">{errorData.message}</p>
              </div>
            </div>

            {/* Error Details */}
            {errorData.error && (
              <div className="p-3 bg-surface-raised rounded-lg border border-surface-border">
                <p className="text-xs text-gray-400 mb-1">Error Code</p>
                <p className="text-sm font-mono text-gray-300">{errorData.error}</p>
              </div>
            )}

            {/* Troubleshooting Tips */}
            <div className="p-3 bg-surface-raised rounded-lg text-sm text-gray-400">
              <p className="font-medium text-gray-300 mb-2">What to try:</p>
              <ul className="space-y-1 ml-4 list-decimal text-xs">
                <li>Check that Client ID and Secret are correct</li>
                <li>Verify redirect URI is registered in Azure</li>
                <li>Make sure the secret hasn't expired</li>
                <li>Try generating a new authorization URL</li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                onClick={() => {
                  setErrorData(null)
                  setStep('form')
                  setForm({
                    client_id: '',
                    client_secret: '',
                    tenant_id: 'common',
                    email: '',
                  })
                }}
                className="w-full px-4 py-2 bg-brand text-white rounded-lg font-medium hover:bg-brand/90"
              >
                Try Again
              </button>

              <button
                onClick={onClose}
                className="w-full px-4 py-2 bg-surface-raised text-gray-300 rounded-lg font-medium hover:bg-surface-raised/80"
              >
                Close
              </button>
            </div>
          </div>
        )}

      </div>
    )

  return content
}
