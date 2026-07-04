import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle2, Mail, Eye, EyeOff, ChevronDown, ExternalLink, Lock, Key } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import { connectSmtp, testSmtp } from '../../api/admin'
import SimpleOAuthFlow from './SimpleOAuthFlow'
import OAuthAuthorizationFlow from './OAuthAuthorizationFlow'

export default function ConnectAccountModal({ open, onClose, onSuccess }) {
  const [accountType, setAccountType] = useState(null) // null (show methods), 'oauth', 'oauth-auth', 'smtp', 'both'
  const [connectionType, setConnectionType] = useState('oauth') // For 'both' mode: which to show
  const [loading, setLoading] = useState(false)
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [smtpTestResult, setSmtpTestResult] = useState(null)
  const [showPasswords, setShowPasswords] = useState({ smtp: false })

  // SMTP form
  const [smtpAccountType, setSmtpAccountType] = useState('personal') // 'personal' or 'business'
  const [smtpCollapsibles, setSmtpCollapsibles] = useState({
    serverSettings: false,
    howToEnable: false,
    troubleshooting: false,
    appPassword: false,
  })
  const [smtpForm, setSmtpForm] = useState({
    email: '',
    display_name: '',
    smtp_host: 'smtp.office365.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
    use_tls: true,
    use_ssl: false,
  })

  const toggleCollapsible = (key) => {
    setSmtpCollapsibles(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleSmtpAccountTypeChange = (type) => {
    setSmtpAccountType(type)
    // Auto-fill SMTP details based on account type
    if (type === 'personal' || type === 'business') {
      setSmtpForm(prev => ({
        ...prev,
        smtp_host: 'smtp.office365.com',
        smtp_port: 587,
        use_tls: true,
        use_ssl: false,
      }))
    }
  }

  const handleSmtpChange = (e) => {
    const { name, value, type, checked } = e.target
    setSmtpForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (name.includes('port') ? parseInt(value) : value)
    }))
  }

  const handleTestSmtp = async (e) => {
    e.preventDefault()
    setTestingSmtp(true)
    setSmtpTestResult(null)

    try {
      await testSmtp({
        smtp_host: smtpForm.smtp_host,
        smtp_port: smtpForm.smtp_port,
        smtp_user: smtpForm.smtp_user,
        smtp_pass: smtpForm.smtp_pass,
        use_tls: smtpForm.use_tls,
        use_ssl: smtpForm.use_ssl,
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


  const handleConnectSmtp = async (e) => {
    e.preventDefault()

    if (!smtpTestResult?.success) {
      toast.error('Please test the SMTP connection first')
      return
    }

    setLoading(true)

    try {
      await connectSmtp({
        email: smtpForm.email,
        display_name: smtpForm.display_name,
        smtp_host: smtpForm.smtp_host,
        smtp_port: smtpForm.smtp_port,
        smtp_user: smtpForm.smtp_user,
        smtp_pass: smtpForm.smtp_pass,
        use_tls: smtpForm.use_tls,
        use_ssl: smtpForm.use_ssl,
      })
      toast.success('SMTP account connected successfully!')
      onSuccess?.()
      onClose()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to connect account')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <Modal open={open} onClose={onClose}>
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Connect Account</h2>
        </div>

        {/* Account Type Selection - Step 1 */}
        {accountType === null && (
          <div className="grid grid-cols-1 gap-3 mb-6">
            <button
              onClick={() => setAccountType('oauth')}
              className="relative group overflow-hidden rounded-lg border-2 border-gray-700 hover:border-brand bg-gray-800/50 hover:bg-gray-800 p-4 text-left transition"
            >
              <div className="flex items-start gap-3">
                <Lock size={24} className="text-brand flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <p className="font-semibold text-white">Microsoft Account (OAuth)</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Secure OAuth 2.0 authentication. Full send & receive access.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded">✓ Send emails</span>
                    <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded">✓ Receive emails</span>
                    <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded">✓ Auto refresh</span>
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setAccountType('oauth-auth')}
              className="relative group overflow-hidden rounded-lg border-2 border-gray-700 hover:border-brand bg-gray-800/50 hover:bg-gray-800 p-4 text-left transition"
            >
              <div className="flex items-start gap-3">
                <Key size={24} className="text-amber-400 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <p className="font-semibold text-white">OAuth Authorization Flow</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Enter Tenant ID and credentials directly. For advanced users.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-1 rounded">✓ Send emails</span>
                    <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-1 rounded">✓ Receive emails</span>
                    <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-1 rounded">✓ Manual setup</span>
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setAccountType('smtp')}
              className="relative group overflow-hidden rounded-lg border-2 border-gray-700 hover:border-brand bg-gray-800/50 hover:bg-gray-800 p-4 text-left transition"
            >
              <div className="flex items-start gap-3">
                <Mail size={24} className="text-blue-400 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <p className="font-semibold text-white">SMTP Account</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Simple password-based SMTP. Send-only access.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded">✓ Send emails</span>
                    <span className="text-xs bg-gray-700 text-gray-400 px-2 py-1 rounded">✗ No receive</span>
                    <span className="text-xs bg-gray-700 text-gray-400 px-2 py-1 rounded">✗ No manage</span>
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setAccountType('both')}
              className="relative group overflow-hidden rounded-lg border-2 border-gray-700 hover:border-brand bg-gray-800/50 hover:bg-gray-800 p-4 text-left transition"
            >
              <div className="flex items-start gap-3">
                <CheckCircle2 size={24} className="text-purple-400 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <p className="font-semibold text-white">Both OAuth + SMTP</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Add OAuth first, then SMTP. Hybrid account with both options.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded">✓ OAuth + SMTP</span>
                    <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded">✓ Flexible</span>
                  </div>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* OAuth Flow - Simplified */}
        {(accountType === 'oauth' || (accountType === 'both' && connectionType === 'oauth')) && (
          <>
            {accountType === 'both' && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => setConnectionType('oauth')}
                    className={`px-4 py-2 rounded font-medium text-sm transition ${
                      connectionType === 'oauth'
                        ? 'bg-brand text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    <Lock size={14} className="inline mr-1.5" />
                    Add OAuth
                  </button>
                  <span className="text-gray-600">→</span>
                  <button
                    onClick={() => setConnectionType('smtp')}
                    className={`px-4 py-2 rounded font-medium text-sm transition ${
                      connectionType === 'smtp'
                        ? 'bg-brand text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    <Mail size={14} className="inline mr-1.5" />
                    Add SMTP
                  </button>
                  <button
                    onClick={() => setAccountType(null)}
                    className="ml-auto text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-800"
                  >
                    ← Back
                  </button>
                </div>
              </div>
            )}

            {accountType === 'oauth' && (
              <button
                onClick={() => setAccountType(null)}
                className="mb-4 text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-800 inline-block"
              >
                ← Back
              </button>
            )}

            <SimpleOAuthFlow
              open={open}
              email={smtpForm.email || ''}
              onClose={onClose}
              onSuccess={() => {
                if (accountType === 'both') {
                  // If both, move to SMTP step
                  setConnectionType('smtp')
                } else {
                  // If just OAuth, close
                  onSuccess()
                }
              }}
            />
          </>
        )}

        {/* OAuth Authorization Flow - Manual Credentials */}
        {accountType === 'oauth-auth' && (
          <>
            <button
              onClick={() => setAccountType(null)}
              className="mb-4 text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-800 inline-block"
            >
              ← Back
            </button>

            <OAuthAuthorizationFlow
              open={open}
              onClose={onClose}
              onSuccess={() => {
                onSuccess()
              }}
            />
          </>
        )}

        {/* SMTP Type */}
        {(accountType === 'smtp' || (accountType === 'both' && connectionType === 'smtp')) && (
          <form onSubmit={handleConnectSmtp} className="space-y-4">
            {accountType === 'both' && (
              <button
                type="button"
                onClick={() => setConnectionType('oauth')}
                className="mb-4 text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-800 inline-block"
              >
                ← Back to OAuth
              </button>
            )}

            {accountType === 'smtp' && (
              <button
                type="button"
                onClick={() => setAccountType(null)}
                className="mb-4 text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-800 inline-block"
              >
                ← Back
              </button>
            )}

            {/* Account Type Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Which account type?</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleSmtpAccountTypeChange('personal')}
                  className={`flex-1 px-3 py-2 rounded text-sm font-medium transition ${
                    smtpAccountType === 'personal'
                      ? 'bg-brand text-white'
                      : 'bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  Personal
                </button>
                <button
                  type="button"
                  onClick={() => handleSmtpAccountTypeChange('business')}
                  className={`flex-1 px-3 py-2 rounded text-sm font-medium transition ${
                    smtpAccountType === 'business'
                      ? 'bg-brand text-white'
                      : 'bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  Business
                </button>
              </div>
              <p className="text-xs text-gray-500">
                {smtpAccountType === 'personal' ? 'Outlook.com, Hotmail.com, Live.com, MSN.com' : 'Microsoft 365'}
              </p>
            </div>

            {/* Business Account Warning */}
            {smtpAccountType === 'business' && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded px-3 py-2 text-xs text-yellow-300 flex gap-2">
                <span>⚠️</span>
                <span>Your organization may have disabled SMTP AUTH. Contact IT if you can't connect.</span>
              </div>
            )}

            {/* Required Fields */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1 block">Email</label>
                  <input type="email" name="email" value={smtpForm.email} onChange={handleSmtpChange} placeholder="user@outlook.com" className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand" required />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1 block">Display Name</label>
                  <input type="text" name="display_name" value={smtpForm.display_name} onChange={handleSmtpChange} placeholder="John Doe" className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand" required />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-400 mb-1 block">SMTP Username</label>
                <input type="text" name="smtp_user" value={smtpForm.smtp_user} onChange={handleSmtpChange} placeholder="your-email@outlook.com" className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand" required />
                <p className="text-xs text-gray-500 mt-1">Usually your full email address</p>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-400 mb-1 block">Password</label>
                <div className="relative">
                  <input type={showPasswords.smtp ? 'text' : 'password'} name="smtp_pass" value={smtpForm.smtp_pass} onChange={handleSmtpChange} placeholder="••••••••" className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand pr-8" required />
                  <button type="button" onClick={() => setShowPasswords(prev => ({ ...prev, smtp: !prev.smtp }))} className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-300">
                    {showPasswords.smtp ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">{smtpAccountType === 'personal' ? '(or app password if using 2FA)' : '(contact IT if using OAuth)'}</p>
              </div>
            </div>

            {/* Server Settings - Collapsible */}
            <div className="border border-gray-700 rounded">
              <button type="button" onClick={() => toggleCollapsible('serverSettings')} className="w-full px-3 py-2 flex items-center justify-between text-sm text-gray-300 hover:bg-gray-800/50">
                <span className="font-medium">📊 Server Settings</span>
                <ChevronDown size={14} className={`transition ${smtpCollapsibles.serverSettings ? 'rotate-180' : ''}`} />
              </button>
              {smtpCollapsibles.serverSettings && (
                <div className="px-3 py-2 bg-gray-900/30 border-t border-gray-700 space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-gray-400 mb-1">SMTP Host</p>
                      <input type="text" name="smtp_host" value={smtpForm.smtp_host} onChange={handleSmtpChange} className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300" />
                    </div>
                    <div>
                      <p className="text-gray-400 mb-1">Port</p>
                      <input type="number" name="smtp_port" value={smtpForm.smtp_port} onChange={handleSmtpChange} className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300" />
                    </div>
                  </div>
                  <div className="flex gap-3 text-gray-400 pt-1">
                    <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" name="use_tls" checked={smtpForm.use_tls} onChange={handleSmtpChange} /> TLS</label>
                    <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" name="use_ssl" checked={smtpForm.use_ssl} onChange={handleSmtpChange} /> SSL</label>
                  </div>
                </div>
              )}
            </div>

            {/* Enable IMAP/POP - Collapsible */}
            <div className="border border-gray-700 rounded">
              <button type="button" onClick={() => toggleCollapsible('howToEnable')} className="w-full px-3 py-2 flex items-center justify-between text-sm text-gray-300 hover:bg-gray-800/50">
                <span className="font-medium">🔧 Enable IMAP/POP</span>
                <ChevronDown size={14} className={`transition ${smtpCollapsibles.howToEnable ? 'rotate-180' : ''}`} />
              </button>
              {smtpCollapsibles.howToEnable && (
                <div className="px-3 py-2 bg-gray-900/30 border-t border-gray-700 space-y-2 text-xs text-gray-300">
                  <p className="text-gray-400 font-medium">Required for mail apps:</p>
                  <ol className="space-y-1 ml-4 list-decimal text-gray-400">
                    <li>Go to Settings → Mail → Forwarding and IMAP</li>
                    <li>Toggle "Let devices and apps use IMAP" ON</li>
                    <li>Click Save</li>
                  </ol>
                </div>
              )}
            </div>

            {/* App Password - Collapsible */}
            <div className="border border-gray-700 rounded">
              <button type="button" onClick={() => toggleCollapsible('appPassword')} className="w-full px-3 py-2 flex items-center justify-between text-sm text-gray-300 hover:bg-gray-800/50">
                <span className="font-medium">🔐 Using 2FA?</span>
                <ChevronDown size={14} className={`transition ${smtpCollapsibles.appPassword ? 'rotate-180' : ''}`} />
              </button>
              {smtpCollapsibles.appPassword && (
                <div className="px-3 py-2 bg-gray-900/30 border-t border-gray-700 space-y-2 text-xs text-gray-300">
                  <p className="text-gray-400">Generate an app password instead:</p>
                  <ol className="space-y-1 ml-4 list-decimal text-gray-400 mt-2">
                    <li>Go to account.microsoft.com → Security</li>
                    <li>Create app password (generated 16-char password)</li>
                    <li>Use this instead of your account password</li>
                  </ol>
                </div>
              )}
            </div>

            {/* Server Settings Reference - Collapsible */}
            <div className="border border-gray-700 rounded">
              <button type="button" onClick={() => toggleCollapsible('troubleshooting')} className="w-full px-3 py-2 flex items-center justify-between text-sm text-gray-300 hover:bg-gray-800/50">
                <span className="font-medium">📋 Settings Reference</span>
                <ChevronDown size={14} className={`transition ${smtpCollapsibles.troubleshooting ? 'rotate-180' : ''}`} />
              </button>
              {smtpCollapsibles.troubleshooting && (
                <div className="px-3 py-2 bg-gray-900/30 border-t border-gray-700 space-y-3 text-xs text-gray-300">
                  <div>
                    <p className="font-medium text-gray-400 mb-1">SMTP (Outgoing)</p>
                    <div className="bg-gray-800/50 rounded p-2 space-y-1 font-mono text-gray-400">
                      <div>Server: <span className="text-gray-300">smtp-mail.outlook.com</span></div>
                      <div>Port: <span className="text-gray-300">587</span></div>
                      <div>Encryption: <span className="text-gray-300">STARTTLS</span></div>
                      <div>Auth: <span className="text-gray-300">OAuth2/Modern Auth</span></div>
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-gray-400 mb-1">IMAP (Incoming)</p>
                    <div className="bg-gray-800/50 rounded p-2 space-y-1 font-mono text-gray-400">
                      <div>Server: <span className="text-gray-300">outlook.office365.com</span></div>
                      <div>Port: <span className="text-gray-300">993</span></div>
                      <div>Encryption: <span className="text-gray-300">SSL/TLS</span></div>
                      <div>Auth: <span className="text-gray-300">OAuth2/Modern Auth</span></div>
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-gray-400 mb-1">POP (Incoming)</p>
                    <div className="bg-gray-800/50 rounded p-2 space-y-1 font-mono text-gray-400">
                      <div>Server: <span className="text-gray-300">outlook.office365.com</span></div>
                      <div>Port: <span className="text-gray-300">995</span></div>
                      <div>Encryption: <span className="text-gray-300">SSL/TLS</span></div>
                      <div>Auth: <span className="text-gray-300">OAuth2/Modern Auth</span></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Test Result */}
            {smtpTestResult && (
              <div className={`rounded px-3 py-2 flex items-start gap-2 text-xs ${smtpTestResult.success ? 'bg-green-500/10 border border-green-500/20 text-green-300' : 'bg-red-500/10 border border-red-500/20 text-red-300'}`}>
                {smtpTestResult.success ? <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />}
                <p>{smtpTestResult.success ? '✓ Connection successful!' : `✗ ${smtpTestResult.error}`}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTestSmtp}
                disabled={testingSmtp || !smtpForm.smtp_host || !smtpForm.smtp_user || !smtpForm.smtp_pass}
                className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white text-sm font-medium py-2 rounded transition flex items-center justify-center gap-2"
              >
                {testingSmtp ? <Spinner size="xs" /> : <Mail size={14} />}
                {testingSmtp ? 'Testing...' : 'Test'}
              </button>
              <button
                type="submit"
                disabled={loading || !smtpTestResult?.success}
                className="flex-1 bg-brand hover:bg-brand/90 disabled:bg-gray-600 text-white text-sm font-medium py-2 rounded transition flex items-center justify-center gap-2"
              >
                {loading ? <Spinner size="xs" /> : <Mail size={14} />}
                {loading ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
