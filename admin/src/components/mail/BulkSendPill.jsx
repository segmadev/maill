/**
 * BulkSendPill
 *
 * Fixed bottom-right status bar that appears on every admin page whenever
 * a bulk-send job is active or just finished.  Provides quick controls
 * (pause / resume / cancel / dismiss) without needing to open the modal.
 *
 * Clicking the main area dispatches 'open-bulk-send' so InboxPage can
 * re-open the full modal regardless of which page the admin is on.
 */
import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Loader2, Pause, Play, Square, CheckCircle2, XCircle, Send, X, Clock } from 'lucide-react'
import useBulkSendStore from '../../store/bulkSendStore'

function fmtDelay(ms) {
  if (!ms || ms < 1000)  return null
  if (ms < 60000)        return `${ms / 1000}s delay`
  if (ms < 3600000)      return `${ms / 60000}m delay`
  return `${ms / 3600000}h delay`
}

function ProgressBar({ value, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #6366f1, #818cf8)',
        }}
      />
    </div>
  )
}

export default function BulkSendPill() {
  const navigate  = useNavigate()
  const location  = useLocation()

  const {
    status, sent, failed, currentBatch, totalBatches, totalRecipients,
    batchDelay, processedCount,
    pause, resume, cancel, reset, openModal,
  } = useBulkSendStore()

  // Live countdown ticker
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (status === 'idle') return
    const id = setInterval(() => {
      const nba = useBulkSendStore.getState().nextBatchAt
      setCountdown(nba ? Math.max(0, Math.ceil((nba - Date.now()) / 1000)) : 0)
    }, 250)
    return () => clearInterval(id)
  }, [status])

  if (status === 'idle') return null

  const isRunning   = status === 'running'
  const isPaused    = status === 'paused'
  const isDone      = status === 'done'
  const isCancelled = status === 'cancelled'
  const isFinished  = isDone || isCancelled
  const processed   = processedCount
  const remaining   = Math.max(0, totalRecipients - processed)
  const pct         = totalRecipients > 0 ? Math.round((processed / totalRecipients) * 100) : 0
  const delay       = fmtDelay(batchDelay)

  function handleViewDetails() {
    openModal()                          // set requestOpen flag in store
    if (location.pathname !== '/inbox') {
      navigate('/inbox')                 // InboxPage mounts, sees the flag, opens modal
    }
    // If already on /inbox, InboxPage's effect will catch the flag immediately
  }

  // Status colour theme
  const theme = isRunning   ? { bar: 'bg-brand',        icon: 'text-brand',       label: 'text-white'       }
              : isPaused    ? { bar: 'bg-yellow-400',    icon: 'text-yellow-400',  label: 'text-yellow-300'  }
              : isDone      ? { bar: 'bg-green-500',     icon: 'text-green-400',   label: 'text-green-300'   }
              :               { bar: 'bg-red-500',       icon: 'text-red-400',     label: 'text-red-300'     }

  return (
    <div
      className="fixed bottom-5 right-5 z-[60] w-80 rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
      style={{ background: 'rgba(18, 18, 30, 0.96)', backdropFilter: 'blur(16px)' }}
    >
      {/* Top progress stripe */}
      <div className={`h-0.5 ${theme.bar} transition-all duration-500`}
           style={{ width: `${pct}%` }} />

      {/* Main content — clickable area opens modal */}
      <div
        className="flex items-start gap-3 px-4 pt-3 pb-2.5 cursor-pointer hover:bg-white/[0.03] transition-colors"
        onClick={handleViewDetails}
        title="Click to view details"
      >
        {/* Status icon */}
        <div className={`mt-0.5 flex-shrink-0 ${theme.icon}`}>
          {isRunning   && <Loader2      size={16} className="animate-spin" />}
          {isPaused    && <Pause        size={16} />}
          {isDone      && <CheckCircle2 size={16} />}
          {isCancelled && <XCircle      size={16} />}
        </div>

        {/* Text block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-xs font-semibold leading-none ${theme.label}`}>
              {isRunning   ? 'Sending in background…'
                : isPaused   ? 'Bulk send paused'
                : isDone     ? 'Bulk send complete'
                :              'Bulk send cancelled'}
            </p>
            <span className="text-[10px] text-gray-600 flex-shrink-0 font-mono">{pct}%</span>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-2.5 mt-1 text-[11px] text-gray-500">
            <span className="flex items-center gap-1">
              <Send size={9} className="text-gray-600" />
              <span className="text-green-400 font-medium">{sent}</span> sent
            </span>
            {failed.length > 0 && (
              <span className="text-red-400">{failed.length} failed</span>
            )}
            {!isFinished && (
              <span>{remaining} left</span>
            )}
            {!isFinished && (
              <span className="text-gray-600">
                batch {currentBatch}/{totalBatches}
              </span>
            )}
          </div>

          {/* Countdown row (only while running and in inter-batch delay) */}
          {isRunning && countdown > 0 && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-yellow-300/70">
              <Clock size={9} />
              <span>Next batch in {countdown}s</span>
            </div>
          )}
          {isRunning && countdown === 0 && delay && (
            <div className="mt-1 text-[10px] text-gray-600">{delay}</div>
          )}

          {/* Progress bar */}
          {!isFinished && (
            <div className="mt-2">
              <ProgressBar value={processed} total={totalRecipients} />
            </div>
          )}
        </div>
      </div>

      {/* Quick-action bar */}
      <div
        className="flex items-center gap-1 px-3 pb-2.5 pt-0"
        onClick={e => e.stopPropagation()}
      >
        {isRunning && (
          <button
            onClick={pause}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-yellow-400 hover:bg-yellow-400/10 transition-colors"
          >
            <Pause size={11} /> Pause
          </button>
        )}

        {isPaused && (
          <button
            onClick={resume}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-brand hover:bg-brand/10 transition-colors"
          >
            <Play size={11} /> Resume
          </button>
        )}

        {!isFinished && (
          <button
            onClick={cancel}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Square size={11} /> Cancel
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Open modal */}
        <button
          onClick={handleViewDetails}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
        >
          View details
        </button>

        {/* Dismiss when finished */}
        {isFinished && (
          <button
            onClick={reset}
            title="Dismiss"
            className="p-1 rounded-lg text-gray-600 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
