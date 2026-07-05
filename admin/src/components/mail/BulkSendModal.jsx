/**
 * BulkSendModal
 *
 * 3-step wizard for sending personalised bulk email.
 *
 *  Step 1 — Import    (BulkImportStep)   CSV / TXT / JSON, field mapping
 *  Step 2 — Compose   (BulkComposeStep)  Rich editor, variable picker, preview
 *  Step 3 — Progress  (inline)           Live progress, batch history, retry
 */
import { useState, useEffect } from 'react'
import {
  CheckCircle, Loader, Pause, Play, Square,
  ArrowDownToLine, AlertTriangle, RefreshCw,
  ChevronDown, RotateCcw, List, BarChart2,
  Settings2, Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Modal        from '../ui/Modal'
import { createBulkCampaign } from '../../api/admin'
import useMailStore from '../../store/mailStore'
import useBulkSendStore from '../../store/bulkSendStore'
import BulkImportStep from './BulkImportStep'
import AccountSelectionStep from './AccountSelectionStep'
import EmailContentStep from './EmailContentStep'
import SendingSettingsStep from './SendingSettingsStep'
import EmailHealthCheckModal from './EmailHealthCheckModal'

// ── Helpers ───────────────────────────────────────────────────────────────────
const BATCH_SIZES = [5, 10, 20, 50, 100]
const BATCH_DELAYS = [
  { value: 0,         label: 'No delay' },
  { value: 1000,      label: '1 sec'    },
  { value: 2000,      label: '2 sec'    },
  { value: 5000,      label: '5 sec'    },
  { value: 10000,     label: '10 sec'   },
  { value: 30000,     label: '30 sec'   },
  { value: 60000,     label: '1 min'    },
  { value: 120000,    label: '2 min'    },
  { value: 300000,    label: '5 min'    },
  { value: 600000,    label: '10 min'   },
  { value: 1800000,   label: '30 min'   },
  { value: 3600000,   label: '1 hour'   },
]

function fmtDelay(ms) {
  if (!ms)          return 'No delay'
  if (ms < 60000)   return `${ms / 1000}s`
  if (ms < 3600000) return `${ms / 60000}m`
  return `${ms / 3600000}h`
}

function fmtETA(ms) {
  if (ms < 1000)    return '< 1s'
  if (ms < 60000)   return `~${Math.ceil(ms / 1000)}s`
  if (ms < 3600000) return `~${Math.ceil(ms / 60000)}m`
  return `~${(ms / 3600000).toFixed(1)}h`
}

function fmtDuration(ms) {
  if (ms < 1000)    return `${ms}ms`
  if (ms < 60000)   return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
  catch { return iso }
}

function ProgressBar({ value, total }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="w-full bg-surface-border rounded-full h-1.5 overflow-hidden">
      <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Batch History ─────────────────────────────────────────────────────────────
function BatchHistory({ history, totalFailed, onRetryAll, onRetryAddresses }) {
  const [expanded,       setExpanded]       = useState(new Set())
  const [expandedFailed, setExpandedFailed] = useState({})

  function toggleBatch(n) {
    setExpanded(p => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s })
  }
  function toggleFailed(batchNum, i) {
    setExpandedFailed(p => {
      const s = new Set(p[batchNum] ?? [])
      s.has(i) ? s.delete(i) : s.add(i)
      return { ...p, [batchNum]: s }
    })
  }

  if (!history.length) {
    return <p className="text-xs text-gray-600 text-center py-5">No batches completed yet.</p>
  }

  return (
    <div className="space-y-2">
      {totalFailed > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-red-500/5 border border-red-500/20 rounded-lg">
          <span className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertTriangle size={11} /> {totalFailed} failed across all batches
          </span>
          <button onClick={onRetryAll}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-white hover:bg-red-500/20 px-2.5 py-1 rounded-lg transition-colors">
            <RefreshCw size={11} /> Retry all
          </button>
        </div>
      )}

      <div className="space-y-1 max-h-64 overflow-y-auto pr-0.5">
        {history.map(b => {
          const isOpen = expanded.has(b.batchNum)
          const fSet   = expandedFailed[b.batchNum] ?? new Set()
          const pct    = b.recipients.length > 0 ? Math.round((b.sent / b.recipients.length) * 100) : 0

          return (
            <div key={b.batchNum} className="border border-surface-border rounded-lg overflow-hidden">
              <button onClick={() => toggleBatch(b.batchNum)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-raised transition-colors text-left">
                <span className="text-[10px] font-mono text-gray-600 w-10 flex-shrink-0">#{b.batchNum}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-[10px] text-gray-500 mb-0.5">
                    <span className="text-gray-400">{fmtTime(b.sentAt)}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-green-400">{b.sent} sent</span>
                      {b.failed.length > 0 && <span className="text-red-400">{b.failed.length} failed</span>}
                      <span className="text-gray-600">{fmtDuration(b.durationMs)}</span>
                    </span>
                  </div>
                  <div className="w-full h-1 bg-surface-border rounded-full overflow-hidden flex">
                    <div className="h-full bg-green-500/60" style={{ width: `${pct}%` }} />
                    {b.failed.length > 0 && (
                      <div className="h-full bg-red-500/60"
                        style={{ width: `${Math.round((b.failed.length / b.recipients.length) * 100)}%` }} />
                    )}
                  </div>
                </div>
                <ChevronDown size={11} className={`flex-shrink-0 text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOpen && (
                <div className="border-t border-surface-border bg-surface px-3 py-2.5 space-y-2">
                  <div>
                    <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">
                      Recipients ({b.recipients.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {b.recipients.map(email => {
                        const didFail = b.failed.some(f => f.email === email)
                        return (
                          <span key={email} className={`text-[10px] px-1.5 py-0.5 rounded ${
                            didFail
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                              : 'bg-green-500/10 text-green-400'
                          }`}>{email}</span>
                        )
                      })}
                    </div>
                  </div>

                  {b.failed.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] text-gray-600 uppercase tracking-wider">Errors</p>
                        <button onClick={() => onRetryAddresses(b.failed.map(f => f.email))}
                          className="flex items-center gap-1 text-[10px] text-red-400 hover:text-white px-2 py-0.5 rounded hover:bg-red-500/20 transition-colors">
                          <RotateCcw size={9} /> Retry batch
                        </button>
                      </div>
                      <div className="space-y-px">
                        {b.failed.map((f, i) => (
                          <div key={i}>
                            <button onClick={() => toggleFailed(b.batchNum, i)}
                              className="w-full flex items-center justify-between text-[11px] bg-red-500/5 hover:bg-red-500/10 px-2.5 py-1.5 rounded transition-colors text-left">
                              <span className="text-gray-300 truncate max-w-[40%]">{f.email}</span>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-red-400/70 text-[10px] truncate">{f.reason}</span>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button onMouseDown={e => { e.stopPropagation(); onRetryAddresses([f.email]) }}
                                    className="p-0.5 rounded text-gray-600 hover:text-brand transition-colors">
                                    <RotateCcw size={10} />
                                  </button>
                                  <ChevronDown size={10} className={`text-gray-600 transition-transform ${fSet.has(i) ? 'rotate-180' : ''}`} />
                                </div>
                              </div>
                            </button>
                            {fSet.has(i) && (
                              <div className="px-2.5 py-2 bg-red-500/[0.07] border-t border-red-500/10 rounded-b">
                                <p className="text-[10px] text-gray-500 mb-0.5 uppercase tracking-wider">Full error</p>
                                <p className="text-xs text-red-300 break-words">{f.reason}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function BulkSendModal({ open, onClose, onCampaignCreated }) {
  const { accounts } = useMailStore()
  const store = useBulkSendStore()

  // Wizard state
  const [step,        setStep]        = useState(1)
  const [recipients,  setRecipients]  = useState([])   // {email, data}[]
  const [base64Fields,setBase64Fields]= useState([])   // field names whose values are b64
  const [accountId,   setAccountId]   = useState(null)
  const [subject,     setSubject]     = useState('')
  const [body,        setBody]        = useState('')
  const [batchSize,   setBatchSize]   = useState(10)
  const [batchDelay,  setBatchDelay]  = useState(2000)

  // Campaign settings (from Compose step)
  const [campaignSettings, setCampaignSettings] = useState({
    markAsImportant: false,
    emailsPerHour: 50,
    dailyLimit: 500,
    ipRotation: 'reputation',
    enableIpWarmup: false,
    selectedAccounts: [null],
    allocationStrategy: 'round-robin',
    customDistribution: null,
    signature_mode: 'dynamic',
    signature_id: null,
    include_signature: true,
  })

  // Step-4 UI state (Progress)
  const [progressTab,    setProgressTab]    = useState('details')
  const [showLiveConfig, setShowLiveConfig] = useState(false)
  const [countdown,      setCountdown]      = useState(0)
  const [etaMs,          setEtaMs]          = useState(null)
  const [showHealthCheck, setShowHealthCheck] = useState(false)

  // ── Countdown + ETA ticker ────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 6) return
    const id = setInterval(() => {
      const s = useBulkSendStore.getState()
      setCountdown(s.nextBatchAt ? Math.max(0, Math.ceil((s.nextBatchAt - Date.now()) / 1000)) : 0)

      const rem = s.totalRecipients - s.processedCount
      if (rem <= 0 || !s.batchDurations.length) { setEtaMs(null); return }
      const bs   = s.batchSize
      const rbs  = Math.ceil(rem / bs)
      const avg  = s.batchDurations.reduce((a, b) => a + b, 0) / s.batchDurations.length
      const cdMs = s.nextBatchAt ? Math.max(0, s.nextBatchAt - Date.now()) : 0
      setEtaMs(Math.max(0, cdMs + rbs * avg + Math.max(0, rbs - 1) * s.batchDelay))
    }, 250)
    return () => clearInterval(id)
  }, [step])

  // Initialize wizard when modal opens
  useEffect(() => {
    if (open) {
      if (store.status !== 'idle') {
        setStep(6)
      } else {
        resetWizard()
      }
    }
  }, [open]) // eslint-disable-line

  // ── Reset ────────────────────────────────────────────────────────────────
  function resetWizard() {
    setStep(1); setRecipients([]); setSubject(''); setBody('')
    setBatchSize(10); setBatchDelay(2000)
    setProgressTab('details'); setShowLiveConfig(false)
    setCountdown(0); setEtaMs(null)
    const defaultAccountId = accounts[0]?.id ?? null
    setAccountId(defaultAccountId)
    setCampaignSettings({
      markAsImportant: false,
      emailsPerHour: 50,
      dailyLimit: 500,
      ipRotation: 'reputation',
      enableIpWarmup: false,
      selectedAccounts: [defaultAccountId],
      allocationStrategy: 'round-robin',
      customDistribution: null,
      signature_mode: 'dynamic',
      signature_id: null,
      include_signature: true,
    })
  }

  function handleClose() {
    const active = store.status === 'running' || store.status === 'paused'
    if (active) {
      toast('Job continuing in background. Watch the pill at the bottom-right.', { icon: '⚡' })
    } else {
      store.reset(); resetWizard()
    }
    onClose()
  }

  // ── Import complete ──────────────────────────────────────────────────────
  function handleImportDone({ recipients: recs, base64Fields: b64 = [] }) {
    setRecipients(recs)
    setBase64Fields(b64)
    if (!accountId && accounts[0]) setAccountId(accounts[0].id)
    setStep(2)
  }

  // ── Navigation between steps ────────────────────────────────────────────
  function handleNextStep(currentStep) {
    // Extract account selection when moving from step 2
    if (currentStep === 2 && window.__accountSelection) {
      setCampaignSettings(prev => ({
        ...prev,
        selectedAccounts: window.__accountSelection.selectedAccounts,
        allocationStrategy: window.__accountSelection.allocationStrategy,
        customDistribution: window.__accountSelection.customDistribution || null,
      }))
    }
    // Extract campaign settings from window object when moving from settings (step 4)
    if (currentStep === 4 && window.__bulkSendConfig) {
      setCampaignSettings(prev => ({
        ...prev,
        ...window.__bulkSendConfig,
      }))
    }
    setStep(currentStep + 1)
  }

  function handlePreviousStep(currentStep) {
    setStep(currentStep - 1)
  }

  // ── Start sending (from Review step 5) ────────────────────────────────────
  function handleStartSending() {
    // Show health check modal first
    setShowHealthCheck(true)
  }

  async function handleHealthCheckComplete() {
    // Health check passed, save campaign to database (don't start sending yet)
    setShowHealthCheck(false)

    try {
      // Save campaign to database in DRAFT status
      const campaignData = await createBulkCampaign({
        name: subject || 'Unnamed Campaign',
        subject,
        body,
        html_body: body, // Send HTML body explicitly (body contains HTML from Quill editor)
        selected_accounts: campaignSettings.selectedAccounts,
        recipients,
        base64_fields: base64Fields,
        campaign_settings: campaignSettings,
      })

      // Notify parent component
      if (onCampaignCreated) {
        onCampaignCreated(campaignData.campaign)
      }

      toast.success('Campaign created! Click "Start" on the dashboard to begin sending.')
      onClose() // Close wizard
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create campaign')
    }
  }

  // ── Retry helpers ────────────────────────────────────────────────────────
  function handleRetryAll() {
    store.retryAllFailed(); setProgressTab('details')
  }

  function handleRetryAddresses(emails) {
    store.retryAddresses(emails); setProgressTab('details')
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const {
    status, sent, failed, currentBatch, totalBatches: storeBatches,
    totalRecipients, processedCount, batchHistory,
    pause, resume, cancel, setLiveBatchSize, setLiveDelay,
  } = store

  const isActive  = status === 'running' || status === 'paused'
  const isRunning = status === 'running'
  const isDone    = status === 'done' || status === 'cancelled'
  const remaining = Math.max(0, totalRecipients - processedCount)
  const pct       = totalRecipients > 0 ? Math.round((processedCount / totalRecipients) * 100) : 0

  // ── Stepper ──────────────────────────────────────────────────────────────
  const STEPS = ['Import', 'Accounts', 'Content', 'Settings', 'Review', 'Progress']

  return (
    <Modal open={open} onClose={handleClose} title="Bulk Email Send" size="xl">

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-5 text-xs">
        {STEPS.map((label, i) => {
          const n      = i + 1
          const done   = step > n
          const active = step === n
          return (
            <div key={n} className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                active ? 'bg-white text-black' : done ? 'bg-green-500 text-white' : 'bg-surface-border text-gray-500'
              }`}>
                {done ? '✓' : n}
              </div>
              <span className={active ? 'text-white font-medium' : 'text-gray-500'}>{label}</span>
              {i < 2 && <span className="text-gray-700">›</span>}
            </div>
          )
        })}
      </div>

      {/* ══════════════════════ STEP 1: Import ══════════════════════ */}
      {step === 1 && (
        <BulkImportStep onComplete={handleImportDone} />
      )}

      {/* ══════════════════════ STEP 2: Account Selection ══════════════════════ */}
      {step === 2 && (
        <AccountSelectionStep
          recipients={recipients}
          accounts={accounts}
          accountId={accountId}
          setAccountId={setAccountId}
          onBack={() => setStep(1)}
          onNext={() => {
            handleNextStep(2)
            // Ensure window.__accountSelection is set even if AccountSelectionStep didn't
            if (!window.__accountSelection) {
              window.__accountSelection = {
                selectedAccounts: [accountId],
                allocationStrategy: 'round-robin',
                customDistribution: null,
              }
            }
          }}
          previousSelection={campaignSettings.selectedAccounts}
          previousAllocationStrategy={campaignSettings.allocationStrategy}
          previousCustomDistribution={campaignSettings.customDistribution}
        />
      )}

      {/* ══════════════════════ STEP 3: Email Content ══════════════════════ */}
      {step === 3 && (
        <EmailContentStep
          recipients={recipients}
          accounts={accounts}
          base64Fields={base64Fields}
          accountId={accountId}
          subject={subject}
          setSubject={setSubject}
          body={body}
          setBody={setBody}
          onBack={() => handlePreviousStep(3)}
          onNext={() => {
            handleNextStep(3)
            // Extract signature config from window
            if (window.__emailSignatureConfig) {
              setCampaignSettings(prev => ({
                ...prev,
                signature_mode: window.__emailSignatureConfig.signature_mode,
                signature_id: window.__emailSignatureConfig.signature_id,
                include_signature: window.__emailSignatureConfig.include_signature,
              }))
            }
          }}
          selectedAccountIds={(campaignSettings.selectedAccounts || []).filter(id => id !== null && id)}
        />
      )}

      {/* ══════════════════════ STEP 4: Sending Settings ══════════════════════ */}
      {step === 4 && (
        <SendingSettingsStep
          batchSize={batchSize}
          setBatchSize={setBatchSize}
          batchDelay={batchDelay}
          setBatchDelay={setBatchDelay}
          onBack={() => handlePreviousStep(4)}
          onNext={() => handleNextStep(4)}
          selectedAccountIds={campaignSettings.selectedAccounts || []}
        />
      )}

      {/* ══════════════════════ STEP 5: Review ══════════════════════ */}
      {step === 5 && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Review Campaign Settings</h3>
            <p className="text-xs text-gray-500">Before sending</p>
          </div>

          {/* Email Configuration */}
          <div className="bg-surface-raised rounded-lg p-4 border border-surface-border space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Email Configuration</p>
            <div className="grid grid-cols-2 gap-4">
              {campaignSettings.selectedAccounts && campaignSettings.selectedAccounts.length === 1 ? (
                <div>
                  <p className="text-xs text-gray-500">From Account</p>
                  <p className="text-sm text-white font-medium">{accounts.find(a => a.id === campaignSettings.selectedAccounts[0])?.email || accounts.find(a => a.id === accountId)?.email}</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-gray-500">Sending Accounts</p>
                  <p className="text-sm text-white font-medium">{campaignSettings.selectedAccounts?.length || 1} account{campaignSettings.selectedAccounts?.length !== 1 ? 's' : ''}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500">Total Recipients</p>
                <p className="text-sm text-white font-medium">{recipients.length} emails</p>
              </div>
              {campaignSettings.selectedAccounts && campaignSettings.selectedAccounts.length > 1 && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">Distribution Strategy</p>
                  <p className="text-sm text-white font-medium capitalize">{(campaignSettings.allocationStrategy || 'round-robin').replace('-', ' ')}</p>
                </div>
              )}
              <div className="col-span-2">
                <p className="text-xs text-gray-500">Subject</p>
                <p className="text-sm text-white font-medium truncate">{subject}</p>
              </div>
            </div>

            {/* Multi-account distribution preview */}
            {campaignSettings.selectedAccounts && campaignSettings.selectedAccounts.length > 1 && (
              <div className="pt-3 border-t border-surface-border space-y-2">
                <p className="text-xs text-gray-500">Account Distribution:</p>
                <div className="space-y-1">
                  {campaignSettings.selectedAccounts.map(accId => {
                    const account = accounts.find(a => a.id === accId)
                    const emailsPerAccount = campaignSettings.customDistribution && campaignSettings.customDistribution[accId]
                      ? parseInt(campaignSettings.customDistribution[accId])
                      : Math.ceil(recipients.length / campaignSettings.selectedAccounts.length)
                    return (
                      <div key={accId} className="flex items-center justify-between text-xs p-2 bg-surface rounded">
                        <span className="text-gray-400 truncate">{account?.email}</span>
                        <span className="text-brand font-medium">{emailsPerAccount} emails</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Sending Configuration */}
          <div className="bg-surface-raised rounded-lg p-4 border border-surface-border space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Campaign Settings</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <span className={campaignSettings.markAsImportant ? 'text-brand' : 'text-gray-600'}>★</span>
                  Mark as Important
                </p>
                <p className="text-sm text-white font-medium">{campaignSettings.markAsImportant ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Emails Per Hour (Range)</p>
                <p className="text-sm text-white font-medium">
                  {campaignSettings.emailsPerHourRange?.min ?? '—'} - {campaignSettings.emailsPerHourRange?.max ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Daily Limit (Range)</p>
                <p className="text-sm text-white font-medium">
                  {campaignSettings.dailyLimitRange?.min ?? '—'} - {campaignSettings.dailyLimitRange?.max ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">IP Rotation</p>
                <p className="text-sm text-white font-medium capitalize">{(campaignSettings.ipRotation || 'reputation').replace('_', ' ')}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <span className={campaignSettings.enableIpWarmup ? 'text-brand' : 'text-gray-600'}>★</span>
                  IP Warmup
                </p>
                <p className="text-sm text-white font-medium">{campaignSettings.enableIpWarmup ? 'Enabled' : 'Disabled'}</p>
              </div>
            </div>
          </div>

          {/* Batch Settings */}
          <div className="bg-surface-raised rounded-lg p-4 border border-surface-border space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Batch Configuration</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Emails per Batch (Range)</p>
                <p className="text-sm text-white font-medium">
                  {campaignSettings.batchSizeRange?.min ?? '—'} - {campaignSettings.batchSizeRange?.max ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Delay Between Batches (Range)</p>
                <p className="text-sm text-white font-medium">
                  {campaignSettings.batchDelayRange ?
                    `${Math.round(campaignSettings.batchDelayRange.min / 1000)}s - ${Math.round(campaignSettings.batchDelayRange.max / 1000)}s`
                    : '—'
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center bg-surface rounded-xl p-3 border border-surface-border">
              <p className="text-xl font-bold text-brand leading-none">{recipients.length}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">Total Recipients</p>
            </div>
            <div className="text-center bg-surface rounded-xl p-3 border border-surface-border">
              <p className="text-sm text-blue-400 leading-none">
                {Math.ceil(recipients.length / (campaignSettings.batchSizeRange?.max || 10))} - {Math.ceil(recipients.length / (campaignSettings.batchSizeRange?.min || 5))}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">Batches (Range)</p>
            </div>
            <div className="text-center bg-surface rounded-xl p-3 border border-surface-border">
              <p className="text-sm text-green-400 leading-none">
                {fmtETA((Math.ceil(recipients.length / (campaignSettings.batchSizeRange?.max || 10)) - 1) * (campaignSettings.batchDelayRange?.min || 1000))}
                {' — '}
                {fmtETA((Math.ceil(recipients.length / (campaignSettings.batchSizeRange?.min || 5)) - 1) * (campaignSettings.batchDelayRange?.max || 5000))}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">Est. Duration</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => handlePreviousStep(5)} className="btn-ghost text-xs">← Back to Settings</button>
            <button onClick={handleStartSending} className="btn-primary gap-2 text-xs">
              <Play size={12} />
              Send Campaign
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════ STEP 6: Progress ══════════════════════ */}
      {step === 6 && (
        <div className="space-y-4">

          {/* Status + controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isRunning              && <Loader      size={14} className="animate-spin text-brand" />}
              {status === 'paused'    && <Pause       size={14} className="text-yellow-400" />}
              {status === 'cancelled' && <Square      size={14} className="text-red-400" />}
              {status === 'done'      && <CheckCircle size={14} className="text-green-400" />}
              <span className={`text-sm font-medium ${
                isRunning             ? 'text-white'
                : status === 'paused' ? 'text-yellow-400'
                : status === 'done'   ? 'text-green-400'
                : 'text-red-400'
              }`}>
                {isRunning ? 'Sending…' : status === 'paused' ? 'Paused' : status === 'done' ? 'Complete' : 'Cancelled'}
              </span>
            </div>
            <div className="flex gap-1.5">
              {isRunning && (
                <button onClick={pause} className="btn-ghost gap-1 text-xs py-1">
                  <Pause size={11} /> Pause
                </button>
              )}
              {status === 'paused' && (
                <button onClick={resume} className="btn-primary gap-1 text-xs py-1">
                  <Play size={11} /> Resume
                </button>
              )}
              {isActive && (
                <>
                  <button onClick={handleClose} className="btn-ghost gap-1 text-xs py-1 text-gray-400 hover:text-brand">
                    <ArrowDownToLine size={11} /> Background
                  </button>
                  <button onClick={cancel} className="btn-ghost gap-1 text-xs py-1 hover:text-red-400">
                    <Square size={11} /> Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Batch {currentBatch} / {storeBatches}</span>
              <span>{processedCount} / {totalRecipients} ({pct}%)</span>
            </div>
            <ProgressBar value={processedCount} total={totalRecipients} />
          </div>

          {/* Countdown + ETA */}
          {isRunning && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5">
                {countdown > 0 ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400/80 animate-pulse flex-shrink-0" />
                    <Clock size={10} className="text-yellow-400/70" />
                    <span className="text-yellow-300/80">Next batch in {countdown}s</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse flex-shrink-0" />
                    <span className="text-gray-400">Sending batch…</span>
                  </>
                )}
              </span>
              {etaMs !== null && (
                <span className="text-gray-600">ETA: <span className="text-gray-400">{fmtETA(etaMs)}</span></span>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Sent',      value: sent,          color: 'text-green-400' },
              { label: 'Failed',    value: failed.length, color: failed.length ? 'text-red-400' : 'text-gray-400' },
              { label: 'Remaining', value: remaining,     color: 'text-gray-300' },
            ].map(s => (
              <div key={s.label} className="text-center bg-surface rounded-xl p-3 border border-surface-border">
                <p className={`text-xl font-bold leading-none ${s.color}`}>{s.value}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div>
            <div className="flex gap-0 border-b border-surface-border mb-3">
              {[
                { id: 'details', label: 'Details',                           icon: <BarChart2 size={11} /> },
                { id: 'history', label: `Batches (${batchHistory.length})`,  icon: <List size={11} />     },
              ].map(t => (
                <button key={t.id} onClick={() => setProgressTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors border-b-2 -mb-px ${
                    progressTab === t.id ? 'border-brand text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Details tab */}
            {progressTab === 'details' && (
              <div className="space-y-3">
                {/* Live settings */}
                {isActive && (
                  <div className="border border-surface-border rounded-xl overflow-hidden">
                    <button onClick={() => setShowLiveConfig(o => !o)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-400 hover:bg-surface-raised transition-colors">
                      <span className="flex items-center gap-2">
                        <Settings2 size={12} /> Live settings
                        <span className="text-gray-600">— {store.batchSize}/batch · {fmtDelay(store.batchDelay)} between batches</span>
                      </span>
                      <ChevronDown size={11} className={`transition-transform ${showLiveConfig ? 'rotate-180' : ''}`} />
                    </button>
                    {showLiveConfig && (
                      <div className="px-4 pb-4 pt-1 border-t border-surface-border space-y-4 bg-surface-raised">
                        <div>
                          <p className="text-[11px] text-gray-500 mb-2">Emails per batch</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {BATCH_SIZES.map(n => (
                              <button key={n} onClick={() => setLiveBatchSize(n)}
                                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                  store.batchSize === n ? 'bg-brand/20 text-brand' : 'text-gray-500 hover:bg-surface hover:text-white'
                                }`}>{n}</button>
                            ))}
                          </div>
                          <p className="text-[10px] text-gray-600 mt-1.5">Takes effect on the next batch.</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-gray-500 mb-2">Delay between batches</p>
                          <div className="grid grid-cols-6 gap-1.5">
                            {BATCH_DELAYS.map(d => (
                              <button key={d.value} onClick={() => setLiveDelay(d.value)}
                                className={`px-2 py-1.5 rounded-lg text-[11px] font-medium text-center transition-colors ${
                                  store.batchDelay === d.value ? 'bg-brand/20 text-brand' : 'text-gray-500 hover:bg-surface hover:text-white'
                                }`}>{d.label}</button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Failed list */}
                {failed.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
                        <AlertTriangle size={11} className="text-red-400" />
                        {failed.length} failed recipient{failed.length !== 1 ? 's' : ''}
                      </p>
                      {isDone && (
                        <button onClick={handleRetryAll}
                          className="flex items-center gap-1.5 text-xs text-red-400 hover:text-white px-2.5 py-1 rounded-lg hover:bg-red-500/20 transition-colors">
                          <RefreshCw size={11} /> Retry all
                        </button>
                      )}
                    </div>
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-red-500/20">
                      {failed.map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-red-500/5 hover:bg-red-500/10 px-3 py-1.5 border-b border-red-500/10 last:border-0">
                          <span className="text-gray-300 truncate max-w-[45%]">{f.email}</span>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-red-400/70 text-[10px] truncate">{f.reason}</span>
                            <button onClick={() => handleRetryAddresses([f.email])} title="Retry"
                              className="flex-shrink-0 p-0.5 rounded text-gray-600 hover:text-brand transition-colors">
                              <RotateCcw size={11} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!failed.length && isDone && (
                  <div className="flex items-center justify-center gap-2 py-4 text-green-400 text-sm">
                    <CheckCircle size={16} /> All {sent} emails sent successfully!
                  </div>
                )}
              </div>
            )}

            {/* History tab */}
            {progressTab === 'history' && (
              <BatchHistory
                history={batchHistory}
                totalFailed={failed.length}
                onRetryAll={handleRetryAll}
                onRetryAddresses={handleRetryAddresses}
              />
            )}
          </div>

          {/* Done buttons */}
          {isDone && (
            <div className="flex justify-end gap-2 pt-1 border-t border-surface-border">
              <button onClick={() => { store.reset(); resetWizard() }} className="btn-ghost text-xs">Send another</button>
              <button onClick={() => { store.reset(); resetWizard(); onClose() }} className="btn-primary text-xs">Done</button>
            </div>
          )}
        </div>
      )}

      {/* Email Health Check Modal */}
      <EmailHealthCheckModal
        open={showHealthCheck}
        onClose={() => setShowHealthCheck(false)}
        onSend={handleHealthCheckComplete}
        accountId={accountId}
        subject={subject}
        body={body}
        senderEmail={null}
        campaignSettings={campaignSettings}
        recipients={recipients}
        signatureMode={campaignSettings.signature_mode}
        signatureId={campaignSettings.signature_id}
        includeSignature={campaignSettings.include_signature}
      />
    </Modal>
  )
}
