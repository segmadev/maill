import { useState, useEffect, useRef } from 'react'
import { AlertCircle, CheckCircle2, Copy, Lock, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import Spinner from '../ui/Spinner'
import { startOAuthAuthorization } from '../../api/admin'
import client from '../../api/client'

/**
 * Simplified OAuth Flow using Admin Settings
 *
 * User flow:
 * 1. Click "Connect with Microsoft"
 * 2. System generates OAuth URL using admin-configured credentials
 * 3. Opens in new window
 * 4. User signs in with Microsoft account
 * 5. System auto-saves account
 * 6. Modal detects and shows success
 */
export default function SimpleOAuthFlow({ open, email: initialEmail, onClose, onSuccess }) {
  const [step, setStep] = useState('email') // 'email', 'ready', 'authorizing', 'waiting', 'success', 'error'
  const [loading, setLoading] = useState(false)
  const [state, setState] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [email, setEmail] = useState(initialEmail || '')
  const [scopes, setScopes] = useState([])
  const authWindowRef = useRef(null)
  const pollingIntervalRef = useRef(null)

  // Fetch scopes and cleanup on modal close
  useEffect(() => {
    if (open) {
      const fetchScopes = async () => {
        try {
          const response = await fetch(`${import.meta.env.VITE_API_BASE}/settings/microsoft-scopes`)
          const data = await response.json()
          if (data.scopes && Array.isArray(data.scopes)) {
            setScopes(data.scopes)
          } else {
            console.error('Invalid scopes response:', data)
            setScopes([])
          }
        } catch (error) {
          console.error('Failed to fetch scopes:', error)
          setScopes([]) // Do not fallback to hardcoded values
        }
      }
      fetchScopes()
    } else {
      stopPolling()
      if (authWindowRef.current && !authWindowRef.current.closed) {
        authWindowRef.current.close()
      }
    }
  }, [open])

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
  }

  const handleStartOAuth = async () => {
    setLoading(true)
    setErrorMsg(null)

    try {
      // Validate scopes were loaded
      if (!scopes || scopes.length === 0) {
        throw new Error('OAuth scopes not configured. Please check admin settings.')
      }

      // Start OAuth flow (uses admin settings internally)
      const result = await startOAuthAuthorization({
        client_id: 'admin-settings', // Backend will use settings
        tenant_id: 'admin-settings',
        client_secret: 'admin-settings',
        email: email,
        scopes: scopes,
      })

      if (!result.url) {
        throw new Error('Failed to generate authorization URL')
      }

      setState(result.state)
      setStep('authorizing')

      // Open authorization window
      const width = 600
      const height = 700
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2
      authWindowRef.current = window.open(
        result.url,
        'oauth_auth',
        `width=${width},height=${height},left=${left},top=${top}`
      )

      if (!authWindowRef.current) {
        throw new Error('Failed to open authorization window')
      }

      // Move to waiting step
      setStep('waiting')
      startPolling(result.state)
    } catch (error) {
      setErrorMsg(error.message || 'Failed to start OAuth flow')
      setStep('error')
      toast.error(error.message || 'OAuth flow failed')
    } finally {
      setLoading(false)
    }
  }

  const startPolling = (pollState) => {
    let attempts = 0
    const maxAttempts = 120 // 60 seconds

    pollingIntervalRef.current = setInterval(async () => {
      attempts++

      try {
        const data = await client.get(`/admin/oauth-status`, {
          params: { state: pollState }
        }).then(r => r.data)

        if (data.success) {
          stopPolling()
          setStep('success')
          toast.success('Account connected successfully!')
          setTimeout(() => {
            onSuccess()
            onClose()
          }, 1500)
        } else if (data.error) {
          stopPolling()
          setErrorMsg(data.message || 'Authorization failed')
          setStep('error')
          toast.error(data.message || 'Authorization failed')
        }
      } catch (err) {
        // Polling continues on error
      }

      if (attempts >= maxAttempts) {
        stopPolling()
        setErrorMsg('Authorization timeout')
        setStep('error')
        toast.error('Authorization timeout')
      }
    }, 500)
  }

  if (step === 'success') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg p-6 bg-green-500/10 border border-green-500/20 text-center space-y-3">
          <div className="flex justify-center">
            <div className="rounded-full bg-green-500/20 p-3">
              <CheckCircle2 size={32} className="text-green-400" />
            </div>
          </div>
          <div>
            <p className="text-lg font-semibold text-green-300">Success!</p>
            <p className="text-sm text-green-300/80 mt-1">{email} connected</p>
          </div>
          <p className="text-xs text-green-300/60">
            You can now send and receive emails from this account
          </p>
        </div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg p-6 bg-red-500/10 border border-red-500/20 text-center space-y-3">
          <div className="flex justify-center">
            <div className="rounded-full bg-red-500/20 p-3">
              <AlertCircle size={32} className="text-red-400" />
            </div>
          </div>
          <div>
            <p className="text-lg font-semibold text-red-300">Authorization Failed</p>
            <p className="text-sm text-red-300/80 mt-2">{errorMsg}</p>
          </div>
          <button
            onClick={() => {
              setStep('ready')
              setErrorMsg(null)
              setState(null)
            }}
            className="w-full mt-4 bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg transition"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (step === 'waiting') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg p-6 bg-blue-500/10 border border-blue-500/20 text-center space-y-4">
          <div className="flex justify-center">
            <Spinner size={32} />
          </div>
          <div>
            <p className="text-lg font-semibold text-blue-300">Waiting for Authorization</p>
            <p className="text-sm text-blue-300/80 mt-2">
              Complete the sign-in in the opened window
            </p>
          </div>
          <p className="text-xs text-blue-300/60">
            If the window didn't open, please check your browser's popup settings
          </p>
          <button
            onClick={() => {
              stopPolling()
              setStep('ready')
              setState(null)
              if (authWindowRef.current && !authWindowRef.current.closed) {
                authWindowRef.current.close()
              }
            }}
            className="w-full mt-4 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 rounded-lg transition text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Email input step
  if (step === 'email') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg p-6 bg-gray-800/50 border border-gray-700 space-y-4">
          <div>
            <p className="text-lg font-semibold text-white mb-1">Your Email Address</p>
            <p className="text-sm text-gray-400">Enter the email address you want to connect</p>
          </div>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@outlook.com"
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-brand text-sm"
            autoFocus
          />

          <button
            onClick={() => {
              if (!email || !email.includes('@')) {
                toast.error('Please enter a valid email address')
                return
              }
              setStep('ready')
            }}
            className="w-full bg-brand hover:bg-brand/90 text-white font-medium py-2 rounded-lg transition"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  // Default: ready state
  return (
    <div className="space-y-4">
      <div className="rounded-lg p-6 bg-gradient-to-br from-blue-500/10 to-brand/10 border border-brand/20 text-center space-y-4">
        <div className="flex justify-center">
          <div className="rounded-full bg-brand/20 p-3">
            <Lock size={32} className="text-brand" />
          </div>
        </div>

        <div>
          <p className="text-lg font-semibold text-white">Connect Microsoft Account</p>
          <p className="text-sm text-gray-400 mt-1">{email}</p>
        </div>

        <p className="text-sm text-gray-400">
          You'll be asked to sign in with your Microsoft account. This is safe and secure.
        </p>

        <button
          onClick={handleStartOAuth}
          disabled={loading}
          className="w-full bg-brand hover:bg-brand/90 disabled:bg-gray-600 text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Spinner size={16} />
              Preparing...
            </>
          ) : (
            <>
              <Lock size={18} />
              Connect with Microsoft
            </>
          )}
        </button>

        <button
          onClick={() => setStep('email')}
          className="w-full text-gray-400 hover:text-gray-300 text-sm font-medium py-2 rounded-lg transition"
        >
          ← Change email
        </button>

        <div className="flex items-start gap-2 bg-gray-800/50 rounded p-3 text-left">
          <CheckCircle2 size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-gray-400 space-y-1">
            <p>✓ Secure OAuth 2.0 authentication</p>
            <p>✓ Uses admin-configured Microsoft app</p>
            <p>✓ Full send and receive access</p>
          </div>
        </div>
      </div>
    </div>
  )
}
