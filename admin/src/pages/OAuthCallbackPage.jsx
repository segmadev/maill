import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/layout/AdminLayout'

/**
 * OAuth Callback Handler Page
 *
 * This page handles the redirect from Microsoft after the user authorizes.
 * Flow:
 * 1. Microsoft redirects here with ?code=... and ?state=...
 * 2. Backend exchanges code for tokens
 * 3. This page shows the result (success or error)
 * 4. Auto-closes modal after 2 seconds
 */
export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [status, setStatus] = useState('loading') // 'loading', 'success', 'error'
  const [message, setMessage] = useState('')
  const [accountId, setAccountId] = useState(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const status = searchParams.get('status')
    const error = searchParams.get('error')
    const message = searchParams.get('message')
    const accountId = searchParams.get('account_id')
    const email = searchParams.get('email')

    if (status === 'success') {
      setStatus('success')
      setAccountId(accountId)
      setEmail(decodeURIComponent(email || ''))
      setMessage('Account connected successfully!')

      // Auto-close after 2 seconds
      setTimeout(() => {
        navigate('/admin/accounts')
        toast.success('Account connected!')
      }, 2000)
    } else if (error) {
      setStatus('error')
      setError(decodeURIComponent(error))
      setMessage(decodeURIComponent(message || error))
    } else {
      setStatus('loading')
      setMessage('Processing authorization...')
    }
  }, [searchParams, navigate])

  return (
    <AdminLayout>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* LOADING STATE */}
          {status === 'loading' && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <Loader size={48} className="text-brand animate-spin" />
              </div>
              <h2 className="text-2xl font-bold text-white">Processing...</h2>
              <p className="text-gray-400">{message}</p>
              <p className="text-sm text-gray-500">Please wait while we exchange your authorization code for tokens.</p>
            </div>
          )}

          {/* SUCCESS STATE */}
          {status === 'success' && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <CheckCircle2 size={48} className="text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">Success!</h2>
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-green-400 font-medium">{email}</p>
                <p className="text-sm text-gray-400 mt-1">Account ID: {accountId}</p>
              </div>
              <p className="text-gray-400">Your tokens have been saved and encrypted securely.</p>
              <p className="text-sm text-gray-500">Redirecting to accounts page...</p>
            </div>
          )}

          {/* ERROR STATE */}
          {status === 'error' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <AlertTriangle size={48} className="text-red-400" />
              </div>
              <h2 className="text-2xl font-bold text-white text-center">Authorization Failed</h2>
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-400 font-medium mb-2">{error}</p>
                <p className="text-sm text-gray-400">{message}</p>
              </div>

              {/* Error Debug Info */}
              <div className="p-3 bg-surface-raised rounded-lg text-xs text-gray-400 max-h-48 overflow-y-auto">
                <p className="font-mono text-gray-500 break-all">{message}</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-gray-400">
                  <strong>Common causes:</strong>
                </p>
                <ul className="text-sm text-gray-400 list-disc list-inside space-y-1">
                  <li>Authorization URL expired (10-minute timeout)</li>
                  <li>User denied access</li>
                  <li>Invalid Client ID or Secret</li>
                  <li>Redirect URI not registered in Azure</li>
                  <li>Scopes not granted to app</li>
                </ul>
              </div>

              <button
                onClick={() => navigate('/admin/accounts')}
                className="w-full px-4 py-2 bg-brand text-white rounded-lg font-medium hover:bg-brand/90"
              >
                Back to Accounts
              </button>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
