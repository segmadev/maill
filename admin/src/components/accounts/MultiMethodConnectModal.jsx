import { useState } from 'react'
import { Shield, Code2, Mail, Key, ChevronRight } from 'lucide-react'
import Modal from '../ui/Modal'
import OAuthAuthorizationFlow from './OAuthAuthorizationFlow'
import DeviceCodeModal from '../mail/DeviceCodeModal'
import EditSmtpModal from './EditSmtpModal'

/**
 * Multi-Method Account Connection
 *
 * Users can choose from 4 connection methods:
 * 1. OAuth Authorization (Browser redirect) - Easiest
 * 2. Device Code Flow (Manual code) - Fallback
 * 3. SMTP/IMAP (Direct config) - No OAuth needed
 * 4. Manual Token (Paste tokens) - Advanced users
 */
export default function MultiMethodConnectModal({ open, onClose, onSuccess }) {
  const [selectedMethod, setSelectedMethod] = useState(null)

  const methods = [
    {
      id: 'oauth-auth',
      name: 'OAuth Authorization Flow',
      description: 'Sign in via Microsoft - Recommended',
      icon: Shield,
      color: 'from-blue-500/20 to-blue-600/20',
      borderColor: 'border-blue-500/30',
      difficulty: 'Easiest',
      time: '2 min',
      pros: [
        'Most secure',
        'Automatic token refresh',
        'Single click sign-in'
      ],
      cons: [
        'Requires Azure app setup'
      ],
      component: 'OAuthAuthorizationFlow'
    },
    {
      id: 'device-code',
      name: 'Device Code Flow',
      description: 'Enter code from Microsoft - Backup option',
      icon: Code2,
      color: 'from-purple-500/20 to-purple-600/20',
      borderColor: 'border-purple-500/30',
      difficulty: 'Medium',
      time: '3 min',
      pros: [
        'No redirect URI needed',
        'Works anywhere',
        'Automatic refresh'
      ],
      cons: [
        'Extra step on mobile',
        'Code expires in 15 min'
      ],
      component: 'OAuthManualDeviceCode'
    },
    {
      id: 'smtp-imap',
      name: 'SMTP/IMAP',
      description: 'Direct email server config - No OAuth',
      icon: Mail,
      color: 'from-green-500/20 to-green-600/20',
      borderColor: 'border-green-500/30',
      difficulty: 'Medium',
      time: '5 min',
      pros: [
        'Works with any email',
        'No Microsoft account needed',
        'Simple config'
      ],
      cons: [
        'Manual refresh needed',
        'Need email password'
      ],
      component: 'SmtpImapConnection'
    },
    {
      id: 'manual-token',
      name: 'Manual Token Entry',
      description: 'Paste access token directly - Advanced',
      icon: Key,
      color: 'from-orange-500/20 to-orange-600/20',
      borderColor: 'border-orange-500/30',
      difficulty: 'Advanced',
      time: '5 min',
      pros: [
        'Full control',
        'Use any token source',
        'No app setup'
      ],
      cons: [
        'Manual refresh needed',
        'Tokens expire'
      ],
      component: 'ManualTokenEntry'
    },
  ]

  if (selectedMethod) {
    // Render the selected method component
    const handleBackToMethods = () => {
      setSelectedMethod(null)
    }

    const handleSuccess = () => {
      setSelectedMethod(null)
      if (onSuccess) onSuccess()
    }

    return (
      <Modal open={open} onClose={() => { handleBackToMethods(); onClose(); }} title="Add Account">
        <div>
          <button
            onClick={handleBackToMethods}
            className="text-sm text-white hover:text-gray-300 mb-4 flex items-center gap-1"
          >
            ← Back to Methods
          </button>

          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-white">
              {methods.find(m => m.id === selectedMethod)?.name}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {methods.find(m => m.id === selectedMethod)?.description}
            </p>
          </div>

          {/* Render the appropriate component based on selected method */}
          {selectedMethod === 'oauth-auth' && (
            <OAuthAuthorizationFlow
              open={open}
              onClose={handleSuccess}
              onSuccess={handleSuccess}
            />
          )}

          {selectedMethod === 'device-code' && (
            <DeviceCodeModal
              open={open}
              onClose={handleSuccess}
              onSuccess={handleSuccess}
            />
          )}

          {selectedMethod === 'smtp-imap' && (
            <EditSmtpModal
              open={open}
              onClose={handleSuccess}
              onSuccess={handleSuccess}
            />
          )}

          {selectedMethod === 'manual-token' && (
            <div className="text-center py-8 text-gray-400">
              Manual Token Entry - Coming soon
            </div>
          )}
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Account - Choose Connection Method">
      <div className="space-y-4">
        <p className="text-sm text-gray-400 mb-6">
          Choose how you'd like to connect your email account. Each method has different advantages.
        </p>

        <div className="grid gap-3">
          {methods.map((method) => {
            const Icon = method.icon
            return (
              <button
                key={method.id}
                onClick={() => setSelectedMethod(method.id)}
                className={`
                  p-4 rounded-lg border-2 transition-all hover:scale-102
                  text-left bg-gradient-to-r ${method.color} ${method.borderColor}
                  hover:border-opacity-100 border-opacity-50
                `}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <Icon size={24} className="text-gray-300 mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-white">{method.name}</h3>
                      <p className="text-sm text-gray-400 mt-0.5">{method.description}</p>

                      {/* Info badges */}
                      <div className="flex gap-2 mt-2">
                        <span className="text-xs px-2 py-1 bg-black/30 rounded text-gray-300">
                          {method.difficulty}
                        </span>
                        <span className="text-xs px-2 py-1 bg-black/30 rounded text-gray-300">
                          {method.time}
                        </span>
                      </div>

                      {/* Pros */}
                      <div className="mt-2 text-xs text-gray-400">
                        <p className="font-medium text-gray-300 mb-1">✓ Pros:</p>
                        <ul className="space-y-0.5 ml-2">
                          {method.pros.map((pro, i) => (
                            <li key={i}>• {pro}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-gray-500 flex-shrink-0 mt-1" />
                </div>
              </button>
            )
          })}
        </div>

        {/* Info box */}
        <div className="mt-6 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
          <p className="font-semibold mb-1">💡 Can't decide?</p>
          <p>
            Start with <strong>OAuth Authorization</strong> if you have Azure setup.
            Otherwise, try <strong>SMTP/IMAP</strong> - it's simple and works with any email.
          </p>
        </div>
      </div>
    </Modal>
  )
}
