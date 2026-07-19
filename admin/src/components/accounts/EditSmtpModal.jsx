import { useState, useEffect } from 'react'
import { Eye, EyeOff, Mail, AlertCircle, CheckCircle2, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import { testSmtp, startOAuthAuthorization } from '../../api/admin'
import { API_BASE } from '../../api/client'

export default function EditSmtpModal({ account, open, onClose, onSave }) {
  const [form, setForm] = useState({
    email: '',
    display_name: '',
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
    use_tls: true,
    use_ssl: false,
  })

  const [showPassword, setShowPassword] = useState(false)
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [smtpTestResult, setSmtpTestResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [hasOAuth, setHasOAuth] = useState(false)
  const [addingOAuth, setAddingOAuth] = useState(false)

  useEffect(() => {
    if (account) {
      // Parse encrypted SMTP credentials
      try {
        const credentials = JSON.parse(account.smtp_credentials || '{}')
        setForm({
          email: account.email || '',
          display_name: account.display_name || '',
          smtp_host: credentials.host || 'smtp.office365.com',
          smtp_port: credentials.port || 587,
          smtp_user: credentials.username || '',
          smtp_pass: credentials.password || '',
          use_tls: credentials.use_tls ?? true,
          use_ssl: credentials.use_ssl ?? false,
        })
      } catch (e) {
        // Fallback to defaults
        setForm({
          email: account.email || '',
          display_name: account.display_name || '',
          smtp_host: 'smtp.office365.com',
          smtp_port: 587,
          smtp_user: '',
          smtp_pass: '',
          use_tls: true,
          use_ssl: false,
        })
      }
      // Check if account has OAuth credentials
      setHasOAuth(!!account.oauth_client_id && !!account.refresh_token)
      setSmtpTestResult(null)
    }
  }, [account, open])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (name.includes('port') ? parseInt(value) : value)
    }))
  }

  const handleTestSmtp = async () => {
    setTestingSmtp(true)
    setSmtpTestResult(null)

    try {
      await testSmtp({
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        smtp_user: form.smtp_user,
        smtp_pass: form.smtp_pass,
        use_tls: form.use_tls,
        use_ssl: form.use_ssl,
      })
      setSmtpTestResult({ success: true })
      toast.success('SMTP connection test successful!')
    } catch (error) {
      setSmtpTestResult({ success: false, error: error.response?.data?.message || 'Test failed' })
      toast.error('SMTP test failed: ' + (error.response?.data?.message || 'Unknown error'))
    } finally {
      setTestingSmtp(false)
    }
  }

  const handleSave = async () => {
    if (!form.smtp_host || !form.smtp_user || !form.smtp_pass) {
      toast.error('Please fill in all required fields')
      return
    }

    if (!smtpTestResult?.success) {
      toast.error('Please test the SMTP connection first')
      return
    }

    setSaving(true)
    try {
      await onSave({
        ...form,
        account_id: account.id,
      })
      toast.success('SMTP settings updated successfully!')
      onClose()
    } catch (error) {
      toast.error('Failed to save settings: ' + (error.response?.data?.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const handleAddOAuth = async () => {
    setAddingOAuth(true)
    try {
      const result = await startOAuthAuthorization({
        client_id: process.env.REACT_APP_OAUTH_CLIENT_ID || '',
        tenant_id: process.env.REACT_APP_OAUTH_TENANT_ID || '',
        client_secret: process.env.REACT_APP_OAUTH_CLIENT_SECRET || '',
        email: account.email,
      })

      if (result.url) {
        // Open OAuth window
        const width = 600
        const height = 700
        const left = window.screenX + (window.outerWidth - width) / 2
        const top = window.screenY + (window.outerHeight - height) / 2
        window.open(result.url, 'oauth', `width=${width},height=${height},left=${left},top=${top}`)

        // Poll for result
        let attempts = 0
        const maxAttempts = 60 // 30 seconds max
        const pollInterval = setInterval(async () => {
          attempts++
          try {
            const checkResult = await fetch(`${API_BASE}/oauth-status?state=${result.state}`)
            const data = await checkResult.json()

            if (data.success) {
              clearInterval(pollInterval)
              setHasOAuth(true)
              toast.success('OAuth credentials added successfully!')
            } else if (data.error && attempts > maxAttempts) {
              clearInterval(pollInterval)
              toast.error(data.message || 'OAuth authorization failed')
            }
          } catch (e) {
            if (attempts > maxAttempts) {
              clearInterval(pollInterval)
            }
          }
        }, 500)
      }
    } catch (error) {
      toast.error('Failed to start OAuth: ' + (error.message || 'Unknown error'))
    } finally {
      setAddingOAuth(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="w-full max-w-lg">
        <h2 className="text-xl font-bold mb-4 text-white">Edit SMTP Settings</h2>

        <div className="space-y-4">
          {/* Email and Display Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1 block">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="user@outlook.com"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1 block">Display Name</label>
              <input
                type="text"
                name="display_name"
                value={form.display_name}
                onChange={handleChange}
                placeholder="John Doe"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          {/* SMTP Host and Port */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1 block">SMTP Host</label>
              <input
                type="text"
                name="smtp_host"
                value={form.smtp_host}
                onChange={handleChange}
                placeholder="smtp.office365.com"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1 block">Port</label>
              <input
                type="number"
                name="smtp_port"
                value={form.smtp_port}
                onChange={handleChange}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="text-xs font-medium text-gray-400 mb-1 block">SMTP Username</label>
            <input
              type="text"
              name="smtp_user"
              value={form.smtp_user}
              onChange={handleChange}
              placeholder="your-email@outlook.com"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand"
            />
            <p className="text-xs text-gray-500 mt-1">Usually your full email address</p>
          </div>

          {/* Password */}
          <div>
            <label className="text-xs font-medium text-gray-400 mb-1 block">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="smtp_pass"
                value={form.smtp_pass}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand pr-8"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-300"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">(or app password if using 2FA)</p>
          </div>

          {/* Encryption Options */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                name="use_tls"
                checked={form.use_tls}
                onChange={handleChange}
                className="rounded border-gray-600 text-brand focus:ring-brand"
              />
              Use TLS
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                name="use_ssl"
                checked={form.use_ssl}
                onChange={handleChange}
                className="rounded border-gray-600 text-brand focus:ring-brand"
              />
              Use SSL
            </label>
          </div>

          {/* OAuth Status */}
          <div className={`rounded px-3 py-2 flex items-center justify-between text-xs ${
            hasOAuth
              ? 'bg-green-500/10 border border-green-500/20 text-green-300'
              : 'bg-gray-800/50 border border-gray-700 text-gray-400'
          }`}>
            <div className="flex items-center gap-2">
              <Lock size={14} />
              <div>
                <p className="font-medium">{hasOAuth ? '✓ OAuth Connected' : 'No OAuth Credentials'}</p>
                <p className="text-[11px] opacity-75 mt-0.5">
                  {hasOAuth
                    ? 'Can use OAuth2 SMTP for sending'
                    : 'Add OAuth for secure OAuth2 SMTP sending'}
                </p>
              </div>
            </div>
            {!hasOAuth && (
              <button
                onClick={handleAddOAuth}
                disabled={addingOAuth}
                className="flex-shrink-0 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-xs font-medium py-1 px-3 rounded transition flex items-center gap-1"
              >
                {addingOAuth ? <Spinner size={10} /> : <Mail size={12} />}
                {addingOAuth ? 'Connecting...' : 'Add OAuth'}
              </button>
            )}
          </div>

          {/* Test Result */}
          {smtpTestResult && (
            <div className={`rounded px-3 py-2 flex items-start gap-2 text-xs ${
              smtpTestResult.success
                ? 'bg-green-500/10 border border-green-500/20 text-green-300'
                : 'bg-red-500/10 border border-red-500/20 text-red-300'
            }`}>
              {smtpTestResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              <p>{smtpTestResult.success ? '✓ Connection successful!' : `✗ ${smtpTestResult.error}`}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <button
              onClick={handleTestSmtp}
              disabled={testingSmtp || !form.smtp_host || !form.smtp_user || !form.smtp_pass}
              className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white text-sm font-medium py-2 rounded transition flex items-center justify-center gap-2"
            >
              {testingSmtp ? <Spinner size="sm" /> : <Mail size={14} />}
              {testingSmtp ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !smtpTestResult?.success}
              className="flex-1 bg-brand hover:bg-brand/90 disabled:bg-gray-600 text-white text-sm font-medium py-2 rounded transition flex items-center justify-center gap-2"
            >
              {saving ? <Spinner size="sm" /> : <Mail size={14} />}
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
