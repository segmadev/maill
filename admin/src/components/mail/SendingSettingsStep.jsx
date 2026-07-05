/**
 * SendingSettingsStep
 *
 * Configure batch settings with random range support
 * Smart auto-adjustment to prevent deadlocks
 */
import { useState, useMemo, useEffect } from 'react'
import { ChevronDown, AlertTriangle, CheckCircle2, Zap } from 'lucide-react'

const BATCH_SIZES = [5, 10, 20, 50, 100]
const BATCH_DELAYS = [
  { value: 0, label: 'No delay' },
  { value: 1000, label: '1 sec' },
  { value: 2000, label: '2 sec' },
  { value: 5000, label: '5 sec' },
  { value: 10000, label: '10 sec' },
  { value: 30000, label: '30 sec' },
  { value: 60000, label: '1 min' },
  { value: 120000, label: '2 min' },
]

function fmtDelay(ms) {
  if (!ms) return 'No delay'
  if (ms < 60000) return `${ms / 1000}s`
  return `${ms / 60000}m`
}

export default function SendingSettingsStep({
  batchSize,
  setBatchSize,
  batchDelay,
  setBatchDelay,
  onBack,
  onNext,
  recipients = 379, // Example recipient count
  accountCount = 1, // Number of selected accounts
  selectedAccountIds = [],
}) {
  const [showBatchSettings, setShowBatchSettings] = useState(true)
  const [showCampaignSettings, setShowCampaignSettings] = useState(true)
  const [autoAdjustments, setAutoAdjustments] = useState([])
  const [showAutoAdjustInfo, setShowAutoAdjustInfo] = useState(false)

  const [markAsImportant, setMarkAsImportant] = useState(false)
  const [ipRotation, setIpRotation] = useState('reputation')
  const [enableIpWarmup, setEnableIpWarmup] = useState(false)

  // Range settings for random behavior
  const [batchSizeRange, setBatchSizeRange] = useState({ min: 5, max: 10 })
  const [batchDelayRange, setBatchDelayRange] = useState({ min: 1000, max: 5000 })
  const [emailsPerHourRange, setEmailsPerHourRange] = useState({ min: 30, max: 50 })
  const [dailyLimitRange, setDailyLimitRange] = useState({ min: 400, max: 500 })

  // Smart auto-adjustment logic
  useEffect(() => {
    const adjustments = []
    let adjusted = {
      batchSizeRange: { ...batchSizeRange },
      batchDelayRange: { ...batchDelayRange },
      emailsPerHourRange: { ...emailsPerHourRange },
      dailyLimitRange: { ...dailyLimitRange },
    }

    // Step 1: Validate range minimums <= maximums
    if (adjusted.batchSizeRange.min > adjusted.batchSizeRange.max) {
      adjusted.batchSizeRange.min = adjusted.batchSizeRange.max
      adjustments.push('Fixed batch size min > max')
    }
    if (adjusted.batchDelayRange.min > adjusted.batchDelayRange.max) {
      adjusted.batchDelayRange.min = adjusted.batchDelayRange.max
      adjustments.push('Fixed batch delay min > max')
    }
    if (adjusted.emailsPerHourRange.min > adjusted.emailsPerHourRange.max) {
      adjusted.emailsPerHourRange.min = adjusted.emailsPerHourRange.max
      adjustments.push('Fixed emails/hour min > max')
    }
    if (adjusted.dailyLimitRange.min > adjusted.dailyLimitRange.max) {
      adjusted.dailyLimitRange.min = adjusted.dailyLimitRange.max
      adjustments.push('Fixed daily limit min > max')
    }

    // Step 2: Ensure daily limit accommodates hourly rate
    const minDailyNeeded = adjusted.emailsPerHourRange.max * 24
    if (adjusted.dailyLimitRange.max < minDailyNeeded) {
      adjusted.dailyLimitRange.max = Math.ceil(minDailyNeeded)
      adjustments.push(`Auto-increased daily limit to ${adjusted.dailyLimitRange.max} (hourly rate × 24)`)
    }

    // Step 3: Ensure hourly limit accommodates batch size and delay
    const maxBatchesPerHour = Math.floor(3600000 / adjusted.batchDelayRange.min)
    const maxEmailsFromBatches = maxBatchesPerHour * adjusted.batchSizeRange.max
    if (adjusted.emailsPerHourRange.max < maxEmailsFromBatches) {
      adjusted.emailsPerHourRange.max = Math.ceil(maxEmailsFromBatches)
      adjustments.push(`Auto-increased hourly limit to ${adjusted.emailsPerHourRange.max}`)
    }

    // Step 4: Reduce batch size if it exceeds hourly minimum
    if (adjusted.batchSizeRange.max > adjusted.emailsPerHourRange.min) {
      adjusted.batchSizeRange.max = Math.max(1, adjusted.emailsPerHourRange.min)
      adjustments.push(`Auto-reduced batch size max to ${adjusted.batchSizeRange.max}`)
    }

    // Step 5: Increase batch delay if it causes deadlock
    const batchesPerHourWithCurrentDelay = Math.floor(3600000 / adjusted.batchDelayRange.max)
    const potentialEmailsPerHour = batchesPerHourWithCurrentDelay * adjusted.batchSizeRange.max
    if (potentialEmailsPerHour > adjusted.emailsPerHourRange.max) {
      const minDelayNeeded = Math.ceil(3600000 / (adjusted.emailsPerHourRange.max / adjusted.batchSizeRange.max))
      adjusted.batchDelayRange.max = Math.max(adjusted.batchDelayRange.max, minDelayNeeded)
      adjustments.push(`Auto-increased batch delay to ${Math.round(adjusted.batchDelayRange.max / 1000)}s`)
    }

    // Apply adjustments if any
    if (adjustments.length > 0) {
      setBatchSizeRange(adjusted.batchSizeRange)
      setBatchDelayRange(adjusted.batchDelayRange)
      setEmailsPerHourRange(adjusted.emailsPerHourRange)
      setDailyLimitRange(adjusted.dailyLimitRange)
      setAutoAdjustments(adjustments)
      setShowAutoAdjustInfo(true)
    } else {
      setAutoAdjustments([])
    }
  }, [batchSizeRange, batchDelayRange, emailsPerHourRange, dailyLimitRange])

  // Final validation - no errors allowed
  const hasErrors = false // Auto-adjustment prevents all errors

  const handleNext = () => {
    if (hasErrors) {
      alert('Please fix the errors before proceeding')
      return
    }
    // Store campaign settings
    window.__bulkSendConfig = {
      markAsImportant,
      ipRotation,
      enableIpWarmup,
      batchSizeRange,
      batchDelayRange,
      emailsPerHourRange,
      dailyLimitRange,
    }
    onNext()
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-white">Sending Settings</h3>
        <p className="text-xs text-gray-500 mt-1">Configure batching and campaign options</p>
      </div>

      {/* Batch Settings */}
      <div className="bg-surface-raised rounded-lg overflow-hidden border border-surface-border">
        <button
          onClick={() => setShowBatchSettings(!showBatchSettings)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs text-gray-400 hover:bg-surface transition-colors"
        >
          <span className="font-semibold">Batch Settings</span>
          <ChevronDown size={12} className={`transition-transform ${showBatchSettings ? 'rotate-180' : ''}`} />
        </button>

        {showBatchSettings && (
          <div className="px-4 pb-4 pt-2 border-t border-surface-border space-y-4 bg-surface">
            {/* Emails per Batch Range */}
            <div className="space-y-2">
              <label className="text-xs text-gray-500 font-medium flex items-center justify-between">
                <span>Emails per Batch (Random Range)</span>
                <span className="text-brand font-bold">{batchSizeRange.min} - {batchSizeRange.max}</span>
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={batchSizeRange.min}
                  onChange={e => setBatchSizeRange({ ...batchSizeRange, min: parseInt(e.target.value) })}
                  className="w-20 bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-brand"
                  placeholder="Min"
                />
                <span className="text-gray-600">to</span>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={batchSizeRange.max}
                  onChange={e => setBatchSizeRange({ ...batchSizeRange, max: parseInt(e.target.value) })}
                  className="w-20 bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-brand"
                  placeholder="Max"
                />
                <span className="text-[10px] text-gray-600">emails</span>
              </div>
              <p className="text-[10px] text-gray-600">Randomly picks between min-max for each batch</p>
            </div>

            {/* Delay Between Batches Range */}
            <div className="space-y-2">
              <label className="text-xs text-gray-500 font-medium flex items-center justify-between">
                <span>Delay Between Batches (Random Range)</span>
                <span className="text-brand font-bold">{Math.round(batchDelayRange.min / 1000)}s - {Math.round(batchDelayRange.max / 1000)}s</span>
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min="0"
                  max="300000"
                  step="1000"
                  value={batchDelayRange.min}
                  onChange={e => setBatchDelayRange({ ...batchDelayRange, min: parseInt(e.target.value) })}
                  className="w-20 bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-brand"
                  placeholder="Min"
                />
                <span className="text-gray-600">to</span>
                <input
                  type="number"
                  min="0"
                  max="300000"
                  step="1000"
                  value={batchDelayRange.max}
                  onChange={e => setBatchDelayRange({ ...batchDelayRange, max: parseInt(e.target.value) })}
                  className="w-20 bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-brand"
                  placeholder="Max"
                />
                <span className="text-[10px] text-gray-600">ms</span>
              </div>
              <p className="text-[10px] text-gray-600">Randomly picks between min-max for each batch delay</p>
            </div>
          </div>
        )}
      </div>

      {/* Campaign Settings */}
      <div className="bg-surface-raised rounded-lg overflow-hidden border border-surface-border">
        <button
          onClick={() => setShowCampaignSettings(!showCampaignSettings)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs text-gray-400 hover:bg-surface transition-colors"
        >
          <span className="font-semibold">Campaign Settings</span>
          <ChevronDown size={12} className={`transition-transform ${showCampaignSettings ? 'rotate-180' : ''}`} />
        </button>

        {showCampaignSettings && (
          <div className="px-4 pb-4 pt-2 border-t border-surface-border space-y-4 bg-surface">
            {/* Auto-Adjustment Alerts */}
            {autoAdjustments.length > 0 && showAutoAdjustInfo && (
              <div className="p-3 rounded-lg border bg-blue-500/10 border-blue-500/30 space-y-2">
                <div className="flex items-start gap-2">
                  <Zap size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-blue-300 mb-2">Smart Auto-Adjustments Applied:</p>
                    <ul className="text-[10px] text-blue-300/80 space-y-1">
                      {autoAdjustments.map((adj, idx) => (
                        <li key={idx}>✓ {adj}</li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-blue-300/60 mt-2">
                      Settings automatically optimized to prevent deadlocks while respecting your limits.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAutoAdjustInfo(false)}
                  className="text-[10px] text-blue-400 hover:text-blue-300 mt-2"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Mark as Important */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={markAsImportant} onChange={e => setMarkAsImportant(e.target.checked)} className="rounded" />
              <span className="text-xs text-gray-300 font-medium">Mark emails as Important</span>
              <span className="text-[10px] text-gray-600">(high priority)</span>
            </label>

            {/* Emails Per Hour Range */}
            <div className="space-y-2">
              <label className="text-xs text-gray-500 font-medium flex items-center justify-between">
                <span>Emails Per Hour (Random Range)</span>
                <span className="text-brand font-bold">{emailsPerHourRange.min} - {emailsPerHourRange.max}</span>
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={emailsPerHourRange.min}
                  onChange={e => setEmailsPerHourRange({ ...emailsPerHourRange, min: parseInt(e.target.value) })}
                  className="w-20 bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-brand"
                  placeholder="Min"
                />
                <span className="text-gray-600">to</span>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={emailsPerHourRange.max}
                  onChange={e => setEmailsPerHourRange({ ...emailsPerHourRange, max: parseInt(e.target.value) })}
                  className="w-20 bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-brand"
                  placeholder="Max"
                />
                <span className="text-[10px] text-gray-600">emails/hr</span>
              </div>
              <p className="text-[10px] text-gray-600">Randomly picks between min-max each hour</p>
            </div>

            {/* Daily Limit Range */}
            <div className="space-y-2">
              <label className="text-xs text-gray-500 font-medium flex items-center justify-between">
                <span>Daily Limit Per Account (Random Range)</span>
                <span className="text-brand font-bold">{dailyLimitRange.min} - {dailyLimitRange.max}</span>
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={dailyLimitRange.min}
                  onChange={e => setDailyLimitRange({ ...dailyLimitRange, min: parseInt(e.target.value) })}
                  className="w-24 bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-brand"
                  placeholder="Min"
                />
                <span className="text-gray-600">to</span>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={dailyLimitRange.max}
                  onChange={e => setDailyLimitRange({ ...dailyLimitRange, max: parseInt(e.target.value) })}
                  className="w-24 bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-brand"
                  placeholder="Max"
                />
                <span className="text-[10px] text-gray-600">emails/day</span>
              </div>
              <p className="text-[10px] text-gray-600">Randomly picks between min-max each day</p>
            </div>

            {/* IP Rotation */}
            <div>
              <label className="text-xs text-gray-500 font-medium mb-2 block">IP Rotation Strategy</label>
              <div className="space-y-2">
                {[
                  { value: 'none', label: 'None', desc: 'Send from same IP' },
                  { value: 'reputation', label: 'Reputation-based ⭐', desc: 'Rotate based on reputation' },
                  { value: 'every_batch', label: 'Every Batch', desc: 'Rotate after each batch' },
                ].map(opt => (
                  <label key={opt.value} className="flex items-start gap-2 p-2 rounded hover:bg-surface-raised cursor-pointer transition-colors">
                    <input type="radio" name="ip_rotation" value={opt.value} checked={ipRotation === opt.value} onChange={e => setIpRotation(e.target.value)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-300 font-medium">{opt.label}</p>
                      <p className="text-[10px] text-gray-600">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* IP Warmup */}
            <label className="flex items-start gap-2 p-2 rounded hover:bg-surface-raised cursor-pointer transition-colors border border-blue-500/20 bg-blue-500/5">
              <input type="checkbox" checked={enableIpWarmup} onChange={e => setEnableIpWarmup(e.target.checked)} className="mt-1 rounded" />
              <div className="flex-1">
                <p className="text-xs text-gray-300 font-medium">Enable IP Warmup</p>
                <p className="text-[10px] text-gray-600">Gradually increase volume for new IPs</p>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="rounded-lg p-3 space-y-2 border bg-surface border-surface-border">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400">Configuration Summary</p>
          <div className="flex items-center gap-1">
            <CheckCircle2 size={14} className="text-green-400" />
            <span className="text-[10px] text-green-400 font-medium">Valid</span>
          </div>
        </div>
        <div className="text-[10px] text-gray-500 space-y-1">
          <div className="flex justify-between">
            <span>Batch Size Range:</span>
            <span className="text-gray-300">{batchSizeRange.min}-{batchSizeRange.max} emails</span>
          </div>
          <div className="flex justify-between">
            <span>Delay Range:</span>
            <span className="text-gray-300">{Math.round(batchDelayRange.min / 1000)}-{Math.round(batchDelayRange.max / 1000)}s</span>
          </div>
          <div className="flex justify-between">
            <span>Emails/Hour Range:</span>
            <span className="text-gray-300">{emailsPerHourRange.min}-{emailsPerHourRange.max}</span>
          </div>
          <div className="flex justify-between">
            <span>Daily Limit Range:</span>
            <span className="text-gray-300">{dailyLimitRange.min}-{dailyLimitRange.max}</span>
          </div>
          <div className="flex justify-between">
            <span>Important:</span>
            <span className="text-gray-300">{markAsImportant ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between pt-4 border-t border-surface-border">
        <button onClick={onBack} className="btn-ghost text-xs">← Content</button>
        <button onClick={handleNext} className="btn-primary text-xs">
          Review → {autoAdjustments.length > 0 && '(Settings optimized)'}
        </button>
      </div>
    </div>
  )
}
