/**
 * DeviceCodeModal
 *
 * Implements the OAuth 2.0 Device Authorization Grant flow so users with
 * organizational (Azure AD / Microsoft 365) Outlook accounts can connect
 * even when their IT admin has disabled user consent for third-party apps.
 *
 * Flow:
 *   1. On open → call /device-code/start → get user_code + device_code_token
 *   2. Show the user_code prominently; user visits Microsoft's device-auth URL
 *      and enters the code there (no page redirect needed)
 *   3. Poll /device-code/poll every `interval` seconds in the background
 *   4. On 'authorized' → account saved, emit reload event, show success
 *   5. On 'expired' / 'declined' / 'error' → show actionable message
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Monitor, Copy, CheckCircle2, ExternalLink,
  RefreshCw, XCircle, Clock, Loader2, Smartphone,
} from 'lucide-react'
import Modal   from '../ui/Modal'
import Spinner from '../ui/Spinner'
import { startDeviceCode, pollDeviceCode } from '../../api/mail'

// Format seconds → M:SS
function fmtTime(s) {
  const m   = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function DeviceCodeModal({ open, onClose }) {
  const [phase,      setPhase]      = useState('idle')    // idle|loading|ready|success|expired|declined|error
  const [userCode,   setUserCode]   = useState('')
  const [verifyUrl,  setVerifyUrl]  = useState('')
  const [dcToken,    setDcToken]    = useState('')
  const [secondsLeft,setSecondsLeft]= useState(0)
  const [interval,   setInterval_]  = useState(5)
  const [copied,     setCopied]     = useState(false)
  const [errorMsg,   setErrorMsg]   = useState('')
  const [linkedEmail,setLinkedEmail]= useState('')

  const pollTimer      = useRef(null)
  const countdownTimer = useRef(null)
  const dcTokenRef     = useRef('')       // avoids stale closure in poll callback
  const intervalRef    = useRef(5)

  // Keep refs in sync with state
  useEffect(() => { dcTokenRef.current  = dcToken   }, [dcToken])
  useEffect(() => { intervalRef.current = interval  }, [interval])

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  function clearTimers() {
    clearInterval(pollTimer.current)
    clearInterval(countdownTimer.current)
    pollTimer.current      = null
    countdownTimer.current = null
  }

  // ── Start ────────────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    clearTimers()
    setPhase('loading')
    setErrorMsg('')
    setCopied(false)
    setLinkedEmail('')

    try {
      const data = await startDeviceCode()
      setUserCode(data.user_code)
      setVerifyUrl(data.verification_uri)
      setDcToken(data.device_code_token)
      setSecondsLeft(data.expires_in ?? 900)
      setInterval_(data.interval ?? 5)
      setPhase('ready')
    } catch (err) {
      setPhase('error')
      setErrorMsg(
        err.response?.data?.message ??
        err.response?.data?.error   ??
        'Could not start device code flow. Check Azure settings.'
      )
    }
  }, [])

  // Reset + start when modal opens; tear down when it closes
  useEffect(() => {
    if (!open) { clearTimers(); setPhase('idle'); return }
    start()
    return clearTimers
  }, [open]) // eslint-disable-line

  // ── Countdown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'ready') { clearInterval(countdownTimer.current); return }

    countdownTimer.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearTimers()
          setPhase('expired')
          return 0
        }
        return s - 1
      })
    }, 1000)

    return () => clearInterval(countdownTimer.current)
  }, [phase])

  // ── Polling ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'ready') { clearInterval(pollTimer.current); return }

    async function poll() {
      try {
        const res = await pollDeviceCode(dcTokenRef.current)

        if (res.status === 'authorized') {
          clearTimers()
          setLinkedEmail(res.email ?? '')
          setPhase('success')
          // Tell MailSidebar (and any other listener) to reload accounts
          window.dispatchEvent(new CustomEvent('reload-mail-accounts'))
          return
        }
        if (res.status === 'expired') { clearTimers(); setPhase('expired');  return }
        if (res.status === 'declined'){ clearTimers(); setPhase('declined'); return }
        if (res.status === 'error')   {
          clearTimers()
          setPhase('error')
          setErrorMsg(res.message ?? 'Authentication error.')
          return
        }
        if (res.slow_down) {
          // Microsoft asked us to slow down — bump interval by 5 s
          clearInterval(pollTimer.current)
          const newInterval = intervalRef.current + 5
          setInterval_(newInterval)
          // The effect will re-run because `interval` changed → new timer set
        }
        // 'pending' → do nothing, next tick handles it
      } catch {
        // Network glitch — silently retry on next tick
      }
    }

    pollTimer.current = setInterval(poll, interval * 1000)
    return () => clearInterval(pollTimer.current)
  }, [phase, interval]) // eslint-disable-line

  // ── Copy code ────────────────────────────────────────────────────────────────
  function handleCopy() {
    navigator.clipboard.writeText(userCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Modal open={open} onClose={onClose} title="Connect with Device Code" size="sm">

      {/* ── Loading ── */}
      {phase === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-8 text-gray-400">
          <Spinner size={28} />
          <p className="text-sm">Fetching your sign-in code…</p>
        </div>
      )}

      {/* ── Ready ── */}
      {phase === 'ready' && (
        <div className="space-y-5">
          {/* What to do */}
          <div className="flex gap-3 text-sm text-gray-300 leading-relaxed">
            <Smartphone size={18} className="text-brand flex-shrink-0 mt-0.5" />
            <p>
              Open Microsoft's sign-in page on any device, then enter the code below.
              No redirect needed — you stay right here.
            </p>
          </div>

          {/* Step 1 — open URL */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Step 1 — Open this page
            </p>
            <a
              href={verifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-brand/10 border border-brand/20 hover:bg-brand/15 transition-colors group"
            >
              <span className="text-sm font-mono text-brand truncate">{verifyUrl}</span>
              <ExternalLink size={14} className="text-brand flex-shrink-0 group-hover:scale-110 transition-transform" />
            </a>
          </div>

          {/* Step 2 — enter code */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Step 2 — Enter this code
            </p>
            <div className="flex items-center gap-2">
              {/* Big code display */}
              <div className="flex-1 flex items-center justify-center bg-surface-raised border border-surface-border rounded-xl py-4">
                <span className="text-3xl font-mono font-bold tracking-[0.25em] text-white select-all">
                  {userCode}
                </span>
              </div>
              {/* Copy button */}
              <button
                onClick={handleCopy}
                title="Copy code"
                className="flex flex-col items-center gap-1 px-3 py-3 rounded-xl bg-surface-raised border border-surface-border hover:border-brand/40 hover:text-white text-gray-400 transition-colors flex-shrink-0"
              >
                {copied
                  ? <CheckCircle2 size={18} className="text-green-400" />
                  : <Copy size={18} />
                }
                <span className="text-[10px]">{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Status + timer */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
              </span>
              Waiting for you to sign in…
            </div>
            <div className={`flex items-center gap-1 text-xs font-mono tabular-nums ${secondsLeft < 60 ? 'text-red-400' : 'text-gray-500'}`}>
              <Clock size={11} />
              {fmtTime(secondsLeft)}
            </div>
          </div>
        </div>
      )}

      {/* ── Success ── */}
      {phase === 'success' && (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 size={36} className="text-green-400" />
          </div>
          <div>
            <p className="text-white font-semibold text-lg">Account Connected!</p>
            {linkedEmail && (
              <p className="text-sm text-gray-400 mt-1">{linkedEmail}</p>
            )}
            <p className="text-xs text-gray-600 mt-2">Your mailbox will appear in the sidebar shortly.</p>
          </div>
          <button onClick={onClose} className="btn-primary text-sm mt-2">
            Done
          </button>
        </div>
      )}

      {/* ── Expired ── */}
      {phase === 'expired' && (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center">
            <Clock size={32} className="text-yellow-400" />
          </div>
          <div>
            <p className="text-white font-semibold">Code Expired</p>
            <p className="text-sm text-gray-400 mt-1">The sign-in code timed out before it was used.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
            <button onClick={start} className="btn-primary flex items-center gap-2 text-sm">
              <RefreshCw size={13} /> Get New Code
            </button>
          </div>
        </div>
      )}

      {/* ── Declined ── */}
      {phase === 'declined' && (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <XCircle size={32} className="text-red-400" />
          </div>
          <div>
            <p className="text-white font-semibold">Sign-in Cancelled</p>
            <p className="text-sm text-gray-400 mt-1">The request was declined on Microsoft's page.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost text-sm">Close</button>
            <button onClick={start} className="btn-primary flex items-center gap-2 text-sm">
              <RefreshCw size={13} /> Try Again
            </button>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {phase === 'error' && (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <XCircle size={32} className="text-red-400" />
          </div>
          <div>
            <p className="text-white font-semibold">Something went wrong</p>
            {errorMsg && (
              <p className="text-xs text-gray-500 mt-2 max-w-[280px] leading-relaxed">{errorMsg}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost text-sm">Close</button>
            <button onClick={start} className="btn-primary flex items-center gap-2 text-sm">
              <RefreshCw size={13} /> Try Again
            </button>
          </div>
        </div>
      )}

    </Modal>
  )
}
