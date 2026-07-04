import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronRight, ChevronLeft, CheckCircle, X, Bold, Italic, Underline, Code2, Eye, List } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import CampaignImportModal from './CampaignImportModal'
import { useBulkCampaigns } from '../../hooks/useBulkCampaigns'
import { getAccounts } from '../../api/admin'

const STEPS = [
  { id: 1, label: 'Recipients' },
  { id: 2, label: 'Compose' },
  { id: 3, label: 'Schedule' },
  { id: 4, label: 'Accounts' },
  { id: 5, label: 'Review' },
]

export default function CampaignBuilder({ open, onClose, onSuccess }) {
  const { createCampaign } = useBulkCampaigns()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [showImportModal, setShowImportModal] = useState(false)
  const [submitMode, setSubmitMode] = useState('submit') // 'draft' or 'submit'

  const [formData, setFormData] = useState({
    name: '',
    recipients: [],
    subject: '',
    body: '',
    html_body: '',
    importance_high: false,
    config: { emails_per_hour: 50, delay_between: 5 },
    ip_daily_limit: 500,
    ip_rotation_strategy: 'reputation-based',
    ip_warmup_enabled: true,
    account_ids: [],
    recipient_distribution: 'round-robin',
    account_config: {}, // { [accountId]: { percentage?: number, max_emails?: number, priority?: number } }
    status: 'draft', // 'draft' or 'submitted'
  })

  useEffect(() => {
    if (open) {
      const loadAccounts = async () => {
        try {
          const data = await getAccounts()
          setAccounts(data.accounts || [])
        } catch (err) {
          toast.error('Failed to load accounts')
        }
      }
      loadAccounts()
    }
  }, [open])

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(Math.min(5, step + 1))
    }
  }

  const handlePrev = () => {
    if (step > 1) setStep(step - 1)
  }

  const validateStep = (currentStep) => {
    switch (currentStep) {
      case 1:
        if (formData.recipients.length === 0) {
          toast.error('Please add at least one recipient')
          return false
        }
        return true
      case 2:
        if (!formData.name.trim()) {
          toast.error('Campaign name is required')
          return false
        }
        if (!formData.subject.trim()) {
          toast.error('Email subject is required')
          return false
        }
        if (!formData.body.trim() && !formData.html_body.trim()) {
          toast.error('Email body is required')
          return false
        }
        return true
      case 4:
        if (formData.account_ids.length === 0) {
          toast.error('Please select at least one account')
          return false
        }
        return true
      default:
        return true
    }
  }

  const handleSubmit = async (action = 'submit') => {
    if (action === 'submit' && !formData.name.trim()) {
      toast.error('Campaign name is required')
      return
    }
    if (action === 'submit' && !formData.subject.trim()) {
      toast.error('Subject is required')
      return
    }
    if (action === 'submit' && !formData.body.trim() && !formData.html_body.trim()) {
      toast.error('Email body is required')
      return
    }

    setLoading(true)
    try {
      const payload = {
        name: formData.name || `Draft - ${new Date().toLocaleDateString()}`,
        subject: formData.subject,
        body: formData.body,
        html_body: formData.html_body,
        account_ids: formData.account_ids,
        config: formData.config,
        importance_high: formData.importance_high,
        ip_rotation_strategy: formData.ip_rotation_strategy,
        ip_daily_limit: formData.ip_daily_limit,
        ip_warmup_enabled: formData.ip_warmup_enabled,
        recipient_distribution: formData.recipient_distribution,
        account_config: formData.account_config,
        status: action === 'draft' ? 'draft' : 'submitted',
      }

      await createCampaign(payload)
      const message = action === 'draft' ? 'Campaign saved as draft' : 'Campaign created successfully'
      toast.success(message)
      onClose()
      onSuccess?.()
      setFormData({
        name: '',
        recipients: [],
        subject: '',
        body: '',
        html_body: '',
        importance_high: false,
        config: { emails_per_hour: 50, delay_between: 5 },
        ip_daily_limit: 500,
        ip_rotation_strategy: 'reputation-based',
        ip_warmup_enabled: true,
        account_ids: [],
        recipient_distribution: 'round-robin',
        account_config: {},
        status: 'draft',
      })
      setStep(1)
    } catch (err) {
      // Error already shown by toast
    } finally {
      setLoading(false)
    }
  }

  const handleAddRecipients = (newRecipients) => {
    setFormData(prev => ({
      ...prev,
      recipients: [...prev.recipients, ...newRecipients],
    }))
  }

  const handleRemoveRecipient = (index) => {
    setFormData(prev => ({
      ...prev,
      recipients: prev.recipients.filter((_, i) => i !== index),
    }))
  }

  const toggleAccount = (accountId) => {
    setFormData(prev => ({
      ...prev,
      account_ids: prev.account_ids.includes(accountId)
        ? prev.account_ids.filter(id => id !== accountId)
        : [...prev.account_ids, accountId],
    }))
  }

  return (
    <>
      <Modal open={open} onClose={onClose} size="lg">
        <div className="flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-border bg-surface-raised/50 flex-shrink-0">
            <div>
              <h2 className="text-base font-bold text-white">Create Bulk Campaign</h2>
              <p className="text-xs text-gray-500 mt-0.5">Step {step} of {STEPS.length}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Step Indicator */}
          <div className="px-5 py-3 border-b border-surface-border flex items-center gap-1.5 flex-shrink-0 bg-surface/50">
            {STEPS.map((s, idx) => (
              <div key={s.id} className="flex items-center gap-1.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                    step === s.id
                      ? 'bg-brand text-white'
                      : step > s.id
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {step > s.id ? '✓' : s.id}
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`w-5 h-px ${step > s.id ? 'bg-green-600' : 'bg-gray-700'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {step === 1 && <Step1Recipients recipients={formData.recipients} onAdd={handleAddRecipients} onRemove={handleRemoveRecipient} onShowImport={() => setShowImportModal(true)} />}
            {step === 2 && <Step2Compose data={formData} onChange={setFormData} />}
            {step === 3 && <Step3Schedule data={formData} onChange={setFormData} />}
            {step === 4 && <Step4Accounts accounts={accounts} selected={formData.account_ids} onChange={toggleAccount} distribution={formData.recipient_distribution} onDistributionChange={(dist) => setFormData({ ...formData, recipient_distribution: dist })} recipients={formData.recipients} accountConfig={formData.account_config} onAccountConfigChange={(config) => setFormData({ ...formData, account_config: config })} />}
            {step === 5 && <Step5Review data={formData} accounts={accounts} />}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-surface-border bg-surface-raised/50 flex-shrink-0 gap-3">
            <button
              onClick={handlePrev}
              disabled={step === 1 || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 border border-gray-700 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} /> Back
            </button>

            {step < 5 ? (
              <button
                onClick={handleNext}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-brand hover:bg-brand/90 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-auto"
              >
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => handleSubmit('draft')}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium border border-gray-700 text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? <Spinner size={14} /> : '💾'}
                  Save Draft
                </button>
                <button
                  onClick={() => handleSubmit('submit')}
                  disabled={loading || !formData.recipients.length}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? <Spinner size={14} /> : <CheckCircle size={14} />}
                  Create Campaign
                </button>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <CampaignImportModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={async (recipients) => {
          handleAddRecipients(recipients)
          setShowImportModal(false)
        }}
      />
    </>
  )
}

// Step 1: Recipients
function Step1Recipients({ recipients, onAdd, onRemove, onShowImport }) {
  const [manualEmail, setManualEmail] = useState('')
  const [manualName, setManualName] = useState('')

  const handleAddManual = () => {
    if (!manualEmail.trim()) {
      toast.error('Email is required')
      return
    }
    onAdd([{ email: manualEmail, name: manualName, group: '' }])
    setManualEmail('')
    setManualName('')
  }

  return (
    <div className="space-y-4">
      <button
        onClick={onShowImport}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-brand to-brand/80 hover:from-brand/90 hover:to-brand/70 text-white text-sm font-medium transition-all"
      >
        Import Recipients (CSV/JSON)
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-700" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-2 bg-surface text-gray-400 text-xs">Or add manually</span>
        </div>
      </div>

      <div className="space-y-2.5">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
          <input
            type="email"
            value={manualEmail}
            onChange={e => setManualEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-gray-700 text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand transition-colors"
            onKeyPress={e => e.key === 'Enter' && handleAddManual()}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Name (optional)</label>
          <input
            type="text"
            value={manualName}
            onChange={e => setManualName(e.target.value)}
            placeholder="John Doe"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-gray-700 text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand transition-colors"
            onKeyPress={e => e.key === 'Enter' && handleAddManual()}
          />
        </div>
        <button
          onClick={handleAddManual}
          className="w-full px-3 py-1.5 rounded-lg bg-brand hover:bg-brand/90 text-white text-xs font-medium transition-colors"
        >
          Add Recipient
        </button>
      </div>

      {recipients.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 mb-2">
            Recipients ({recipients.length})
          </p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {recipients.map((r, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 rounded-lg bg-surface-raised border border-gray-700 hover:border-gray-600 group transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs text-white truncate">{r.email}</p>
                  {r.name && <p className="text-[10px] text-gray-500">{r.name}</p>}
                </div>
                <button
                  onClick={() => onRemove(idx)}
                  className="text-gray-500 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-all ml-2 flex-shrink-0"
                  title="Remove recipient"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Step 2: Compose
function Step2Compose({ data, onChange }) {
  const [editorMode, setEditorMode] = useState('visual')
  const editorRef = useRef(null)

  const handleEditorInput = useCallback((e) => {
    onChange({ ...data, body: e.currentTarget.innerHTML })
  }, [data, onChange])

  const exec = useCallback((cmd, val = null) => {
    document.execCommand(cmd, false, val)
    if (editorRef.current) {
      onChange({ ...data, body: editorRef.current.innerHTML })
    }
    editorRef.current?.focus()
  }, [data, onChange])

  const switchMode = (newMode) => {
    if (newMode === editorMode) return
    if (editorMode === 'visual' && editorRef.current) {
      onChange({ ...data, body: editorRef.current.innerHTML })
    }
    setEditorMode(newMode)
  }

  useEffect(() => {
    if (editorMode === 'visual' && editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = data.body
    }
  }, [editorMode, data.body])

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Campaign Name *</label>
        <input
          type="text"
          value={data.name}
          onChange={e => onChange({ ...data, name: e.target.value })}
          placeholder="Q4 Newsletter"
          className="w-full px-3 py-2 rounded-lg bg-surface border border-gray-700 text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand transition-colors"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Subject Line *</label>
        <input
          type="text"
          value={data.subject}
          onChange={e => onChange({ ...data, subject: e.target.value })}
          placeholder="Your email subject"
          className="w-full px-3 py-2 rounded-lg bg-surface border border-gray-700 text-white text-xs placeholder-gray-600 focus:outline-none focus:border-brand transition-colors"
        />
      </div>

      {/* Rich Text Editor */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-400">Email Body *</label>
          <div className="flex items-center gap-1 bg-surface border border-surface-border rounded-lg p-1">
            {[
              { id: 'visual', icon: Bold, label: 'Visual' },
              { id: 'html', icon: Code2, label: 'HTML' },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => switchMode(m.id)}
                title={m.label}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  editorMode === m.id
                    ? 'bg-brand/20 text-brand'
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                <m.icon size={10} /> {m.label}
              </button>
            ))}
          </div>
        </div>

        {editorMode === 'visual' && (
          <div className="border border-surface-border rounded-lg overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5 border-b border-surface-border bg-surface-raised/50">
              <EditorButton title="Bold" onClick={() => exec('bold')}>
                <Bold size={12} />
              </EditorButton>
              <EditorButton title="Italic" onClick={() => exec('italic')}>
                <Italic size={12} />
              </EditorButton>
              <EditorButton title="Underline" onClick={() => exec('underline')}>
                <Underline size={12} />
              </EditorButton>
              <div className="w-px h-3.5 bg-surface-border mx-0.5" />
              <EditorButton title="Bullet List" onClick={() => exec('insertUnorderedList')}>
                <List size={12} />
              </EditorButton>
              <EditorButton title="Clear Formatting" onClick={() => exec('removeFormat')}>
                <X size={12} />
              </EditorButton>
            </div>
            {/* Editor */}
            <div
              ref={editorRef}
              onInput={handleEditorInput}
              contentEditable
              suppressContentEditableWarning
              className="w-full px-3 py-2 bg-surface text-white text-xs focus:outline-none resize-none min-h-[120px] max-h-48 overflow-y-auto"
              style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
            />
          </div>
        )}

        {editorMode === 'html' && (
          <div className="border border-surface-border rounded-lg overflow-hidden">
            <textarea
              value={data.body}
              onChange={e => onChange({ ...data, body: e.target.value })}
              placeholder="<p>Your HTML content...</p>"
              className="w-full px-3 py-2 bg-surface border-0 text-white text-xs placeholder-gray-600 focus:outline-none font-mono resize-none min-h-[160px] max-h-48 overflow-y-auto"
            />
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-raised border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors">
        <input
          type="checkbox"
          checked={data.importance_high}
          onChange={e => onChange({ ...data, importance_high: e.target.checked })}
          className="w-3.5 h-3.5 rounded cursor-pointer"
        />
        <span className="text-xs text-white">Mark as Important</span>
      </label>
    </div>
  )
}

function EditorButton({ title, onClick, children }) {
  return (
    <button
      title={title}
      onMouseDown={e => {
        e.preventDefault()
        onClick()
      }}
      className="p-1.5 rounded text-xs text-gray-400 hover:bg-surface hover:text-white transition-colors flex-shrink-0"
    >
      {children}
    </button>
  )
}

// Step 3: Schedule
function Step3Schedule({ data, onChange }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Emails Per Hour</label>
        <select
          value={data.config.emails_per_hour}
          onChange={e =>
            onChange({
              ...data,
              config: { ...data.config, emails_per_hour: parseInt(e.target.value) },
            })
          }
          className="w-full px-3 py-2 rounded-lg bg-surface border border-gray-700 text-white text-xs focus:outline-none focus:border-brand transition-colors"
        >
          <option value="10">10/hour (conservative)</option>
          <option value="20">20/hour</option>
          <option value="50">50/hour (recommended)</option>
          <option value="100">100/hour</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Delay Between Emails</label>
        <select
          value={data.config.delay_between}
          onChange={e =>
            onChange({
              ...data,
              config: { ...data.config, delay_between: parseInt(e.target.value) },
            })
          }
          className="w-full px-3 py-2 rounded-lg bg-surface border border-gray-700 text-white text-xs focus:outline-none focus:border-brand transition-colors"
        >
          <option value="1">1 second</option>
          <option value="5">5 seconds</option>
          <option value="10">10 seconds</option>
          <option value="30">30 seconds</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Daily Limit Per Account</label>
        <select
          value={data.ip_daily_limit}
          onChange={e => onChange({ ...data, ip_daily_limit: parseInt(e.target.value) })}
          className="w-full px-3 py-2 rounded-lg bg-surface border border-gray-700 text-white text-xs focus:outline-none focus:border-brand transition-colors"
        >
          <option value="100">100/day (safe)</option>
          <option value="500">500/day (recommended)</option>
          <option value="1000">1000/day</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">IP Rotation</label>
        <select
          value={data.ip_rotation_strategy}
          onChange={e => onChange({ ...data, ip_rotation_strategy: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-surface border border-gray-700 text-white text-xs focus:outline-none focus:border-brand transition-colors"
        >
          <option value="round-robin">Round-robin</option>
          <option value="reputation-based">Reputation-based (recommended)</option>
        </select>
      </div>

      <label className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-raised border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors">
        <input
          type="checkbox"
          checked={data.ip_warmup_enabled}
          onChange={e => onChange({ ...data, ip_warmup_enabled: e.target.checked })}
          className="w-3.5 h-3.5 rounded cursor-pointer"
        />
        <span className="text-xs text-white">Enable IP warmup</span>
      </label>
    </div>
  )
}

// Step 4: Accounts
function Step4Accounts({ accounts, selected, onChange, distribution, onDistributionChange, recipients, accountConfig, onAccountConfigChange }) {
  const [mode, setMode] = useState('distribution') // 'distribution' or 'custom'

  const totalRecipients = recipients.length
  const selectedAccounts = accounts?.filter(a => selected.includes(a.id)) || []

  const updateAccountConfig = (accountId, key, value) => {
    const newConfig = { ...accountConfig }
    if (!newConfig[accountId]) newConfig[accountId] = {}
    newConfig[accountId][key] = value
    onAccountConfigChange(newConfig)
  }

  // Calculate distribution preview
  const getDistributionPreview = () => {
    if (selectedAccounts.length === 0 || totalRecipients === 0) return {}

    const preview = {}
    if (distribution === 'equal') {
      const perAccount = Math.floor(totalRecipients / selectedAccounts.length)
      selectedAccounts.forEach(a => {
        preview[a.id] = perAccount
      })
      // Distribute remainder
      let remaining = totalRecipients % selectedAccounts.length
      for (let i = 0; i < remaining; i++) {
        preview[selectedAccounts[i].id]++
      }
    } else if (mode === 'custom') {
      selectedAccounts.forEach(a => {
        const cfg = accountConfig[a.id] || {}
        if (cfg.percentage) {
          preview[a.id] = Math.floor(totalRecipients * (cfg.percentage / 100))
        } else if (cfg.max_emails) {
          preview[a.id] = Math.min(cfg.max_emails, totalRecipients)
        } else {
          preview[a.id] = 0
        }
      })
    } else {
      selectedAccounts.forEach(a => {
        preview[a.id] = Math.floor(totalRecipients / selectedAccounts.length)
      })
    }
    return preview
  }

  const preview = getDistributionPreview()
  const totalAssigned = Object.values(preview).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-4">
      {/* Account Selection */}
      <div>
        <p className="text-xs font-medium text-gray-400 mb-3">Select Sending Accounts</p>
        {accounts?.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <p className="text-xs">No accounts available</p>
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.map(account => (
              <label
                key={account.id}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-raised border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(account.id)}
                  onChange={() => onChange(account.id)}
                  className="w-3.5 h-3.5 rounded cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{account.email}</p>
                  <p className="text-[10px] text-gray-500">{account.connection_type === 'smtp' ? 'SMTP' : 'OAuth'}</p>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <>
          {/* Mode Selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode('distribution')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                mode === 'distribution'
                  ? 'bg-brand text-white'
                  : 'bg-surface-raised text-gray-400 hover:text-white'
              }`}
            >
              Auto Distribution
            </button>
            <button
              onClick={() => setMode('custom')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                mode === 'custom'
                  ? 'bg-brand text-white'
                  : 'bg-surface-raised text-gray-400 hover:text-white'
              }`}
            >
              Custom Config
            </button>
          </div>

          {mode === 'distribution' && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Distribution Strategy</label>
              <select
                value={distribution}
                onChange={e => onDistributionChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-gray-700 text-white text-xs focus:outline-none focus:border-brand transition-colors"
              >
                <option value="round-robin">Round-robin (alternating accounts)</option>
                <option value="equal">Equal split (evenly distributed)</option>
                <option value="sequential">Sequential (one account at a time)</option>
                <option value="load-based">Load-based (least busy first)</option>
              </select>
              <p className="text-[10px] text-gray-500 mt-1.5">
                {distribution === 'round-robin' && 'Recipients distributed one-by-one across accounts.'}
                {distribution === 'equal' && 'Recipients split equally among accounts.'}
                {distribution === 'sequential' && 'Recipients assigned to accounts sequentially.'}
                {distribution === 'load-based' && 'Recipients sent from least busy account.'}
              </p>
            </div>
          )}

          {mode === 'custom' && (
            <div className="space-y-3 border border-surface-border rounded-lg p-3 bg-surface/50">
              <p className="text-xs font-medium text-gray-400">Custom Account Configuration</p>
              {selectedAccounts.map(account => (
                <div key={account.id} className="border border-gray-700 rounded-lg p-2.5 space-y-2">
                  <p className="text-xs font-medium text-white">{account.email}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Distribution %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={accountConfig[account.id]?.percentage || ''}
                        onChange={e => updateAccountConfig(account.id, 'percentage', e.target.value ? parseInt(e.target.value) : null)}
                        placeholder="e.g., 30"
                        className="w-full px-2 py-1 rounded bg-surface border border-gray-700 text-white text-xs focus:outline-none focus:border-brand"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Max Emails</label>
                      <input
                        type="number"
                        min="0"
                        value={accountConfig[account.id]?.max_emails || ''}
                        onChange={e => updateAccountConfig(account.id, 'max_emails', e.target.value ? parseInt(e.target.value) : null)}
                        placeholder="e.g., 1000"
                        className="w-full px-2 py-1 rounded bg-surface border border-gray-700 text-white text-xs focus:outline-none focus:border-brand"
                      />
                    </div>
                  </div>
                  {preview[account.id] && (
                    <p className="text-[10px] text-brand mt-1">Preview: {preview[account.id]} emails</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Distribution Preview */}
          {totalRecipients > 0 && selectedAccounts.length > 0 && (
            <div className="border border-blue-500/30 bg-blue-500/10 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-blue-300">Distribution Preview</p>
              <div className="space-y-1">
                {selectedAccounts.map(account => (
                  <div key={account.id} className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-400 truncate">{account.email}</span>
                    <span className="text-white font-medium">{preview[account.id] || 0} / {totalRecipients}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-blue-500/20 pt-2 mt-2 flex items-center justify-between text-[10px] font-medium">
                <span className="text-blue-300">Total Assigned</span>
                <span className={totalAssigned === totalRecipients ? 'text-green-400' : 'text-yellow-400'}>
                  {totalAssigned} / {totalRecipients}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Step 5: Review
function Step5Review({ data, accounts }) {
  return (
    <div className="space-y-4">
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
        <p className="text-xs text-blue-300">Campaign ready to create</p>
      </div>

      <div className="space-y-3">
        <ReviewItem label="Campaign" value={data.name} />
        <ReviewItem label="Recipients" value={`${data.recipients.length} emails`} />
        <ReviewItem label="Subject" value={data.subject} />
        <ReviewItem label="Email Rate" value={`${data.config.emails_per_hour}/hour`} />
        <ReviewItem label="IP Rotation" value={data.ip_rotation_strategy.replace('-', ' ')} />

        {data.account_ids.length > 0 && (
          <div className="border border-surface-border rounded-lg p-3 space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-400">Sending Accounts ({data.account_ids.length})</p>
              <div className="space-y-2 mt-2">
                {accounts
                  ?.filter(a => data.account_ids.includes(a.id))
                  .map(a => {
                    const cfg = data.account_config?.[a.id] || {}
                    const hasCustom = cfg.percentage || cfg.max_emails
                    return (
                      <div key={a.id} className="p-2 rounded bg-surface-raised border border-gray-700">
                        <p className="text-xs text-white">{a.email}</p>
                        {hasCustom && (
                          <p className="text-[10px] text-gray-500 mt-1">
                            {cfg.percentage && `${cfg.percentage}% of recipients`}
                            {cfg.percentage && cfg.max_emails && ' · '}
                            {cfg.max_emails && `Max ${cfg.max_emails} emails`}
                          </p>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
            <div className="border-t border-surface-border pt-2">
              <p className="text-xs font-medium text-gray-400">Distribution Strategy</p>
              <p className="text-[10px] text-gray-500 mt-1">{data.recipient_distribution.replace('-', ' ').charAt(0).toUpperCase() + data.recipient_distribution.replace('-', ' ').slice(1)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ReviewItem({ label, value }) {
  return (
    <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface border border-gray-700">
      <span className="text-xs font-medium text-gray-400">{label}</span>
      <span className="text-xs text-white truncate max-w-xs text-right">{value}</span>
    </div>
  )
}
