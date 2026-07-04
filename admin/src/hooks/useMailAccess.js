/**
 * useMailAccess — progressive mail-scope consent hook
 *
 * Usage in any component that needs to read the inbox:
 *
 *   const { ready, status, MailAccessGate } = useMailAccess()
 *
 *   if (!ready) return <MailAccessGate />   // shows spinner or consent UI
 *   // ... render inbox normally
 *
 * Flow:
 *  1. On mount, calls POST /user/upgrade-mail-access
 *     → backend silently exchanges the stored refresh token for one that
 *       includes Mail.Read (works for personal accounts and most org tenants)
 *  2a. {status:'granted'}          → ready = true, inbox renders normally
 *  2b. {status:'consent_required'} → shows a device-code modal so the user
 *       can approve Mail.Read once, without going through a full sign-in again
 *  2c. {status:'no_account'}       → user has not yet connected a mailbox
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Copy, ExternalLink, Loader2, Mail } from 'lucide-react'
import { upgradeMailAccess } from '../api/mail'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'

export function useMailAccess() {
  // 'checking' | 'granted' | 'consent_required' | 'no_account' | 'error'
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let cancelled = false
    upgradeMailAccess()
      .then(data => { if (!cancelled) setStatus(data.status ?? 'error') })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [])

  const onConsentGranted = useCallback(() => setStatus('granted'), [])

  const ready = status === 'granted'

  const MailAccessGate = useCallback(() => (
    <MailAccessGateUI
      status={status}
      onGranted={onConsentGranted}
    />
  ), [status, onConsentGranted])

  return { ready, status, MailAccessGate }
}

// =============================================================================
// Internal UI — shown while checking or when consent is needed
// =============================================================================

function MailAccessGateUI({ status, onGranted }) {
  if (status === 'checking') {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-gray-500">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Connecting to your inbox…</span>
      </div>
    )
  }

  if (status === 'no_account') {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-gray-500">
        <Mail size={28} className="text-gray-600" />
        <p className="text-sm font-medium text-white">No mailbox connected</p>
        <p className="text-xs text-gray-500 text-center max-w-xs">
          Connect a Microsoft account from the sidebar to start reading your inbox.
        </p>
      </div>
    )
  }

  if (status === 'consent_required') {
    return <MailConsentFlow onGranted={onGranted} />
  }

  // 'error' or unknown
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-gray-500">
      <p className="text-sm text-red-400">Could not connect to your inbox. Please try reconnecting your account.</p>
    </div>
  )
}

// =============================================================================
// One-time mail-permission consent using the device code flow
// =============================================================================
function MailConsentFlow({ onGranted }) {
  const [phase, setPhase]     = useState('idle')   // idle|loading|ready|error
  const [userCode, setUserCode]   = useState('')
  const [verifyUrl, setVerifyUrl] = useState('')
  const [copied, setCopied]       = useState(false)
  const [errMsg, setErrMsg]       = useState('')
  const intervalRef = useRef(null)
  const dcTokenRef  = useRef(null)

  const startFlow = useCallback(async () => {
    setPhase('loading')
    setErrMsg('')
    try {
      const res = await fetch(`${API_BASE}/microsoft/device-code/user-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Request mail scopes specifically for the upgrade
        body: JSON.stringify({ scope_set: 'mail' }),
      })
      const data = await res.json()
      if (!data.user_code) throw new Error(data.message ?? 'Failed to start consent flow.')
      dcTokenRef.current = data.device_code_token
      setUserCode(data.user_code)
      setVerifyUrl(data.verification_uri)
      setPhase('ready')
      startPolling(data.device_code_token, data.interval ?? 5)
    } catch (e) {
      setErrMsg(e.message)
      setPhase('error')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function startPolling(token, interval) {
    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${API_BASE}/microsoft/device-code/user-poll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_code_token: token }),
        })
        const data = await res.json()
        if (data.status === 'authorized') {
          clearInterval(intervalRef.current)
          onGranted()
        }
      } catch { /* network blip — keep polling */ }
    }, interval * 1000)
  }

  useEffect(() => {
    startFlow()
    return () => clearInterval(intervalRef.current)
  }, [startFlow])

  function handleCopy() {
    navigator.clipboard.writeText(userCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
      if (verifyUrl) window.open(verifyUrl, '_blank', 'noopener,noreferrer')
    })
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8 px-4 max-w-sm mx-auto">
      <div className="p-3 rounded-xl bg-brand/10">
        <Mail size={24} className="text-brand" />
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold text-white mb-1">Inbox access needed</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          To read your inbox we need one extra permission.
          Copy the code below, then sign in with Microsoft.
        </p>
      </div>

      {phase === 'loading' && (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader2 size={15} className="animate-spin" /> Generating code…
        </div>
      )}

      {phase === 'ready' && (
        <div className="w-full space-y-3">
          {/* Step 1 — code */}
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Step 1 — Copy this code</p>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center justify-center rounded-lg py-3 bg-brand/10 border border-brand/20">
              <span className="text-xl font-mono font-bold tracking-[0.25em] text-brand select-all">{userCode}</span>
            </div>
            <button
              onClick={handleCopy}
              className="flex flex-col items-center justify-center gap-1 px-3 rounded-lg border border-brand/20 bg-brand/10 transition-colors hover:bg-brand/20"
              style={{ color: copied ? 'var(--color-brand)' : '#9ca3af' }}
            >
              {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
              <span className="text-[10px]">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {/* Step 2 — open link */}
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Step 2 — Open & sign in</p>
          <a
            href={verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg w-full text-white text-sm font-semibold"
            style={{ background: 'var(--color-brand)' }}
          >
            Sign in with Microsoft
            <ExternalLink size={14} className="opacity-70" />
          </a>

          <p className="text-[11px] text-gray-600 text-center">
            Waiting for you to complete sign-in…
          </p>
        </div>
      )}

      {phase === 'error' && (
        <div className="text-center space-y-2">
          <p className="text-xs text-red-400">{errMsg || 'Something went wrong.'}</p>
          <button onClick={startFlow} className="btn-ghost text-xs">Try again</button>
        </div>
      )}
    </div>
  )
}
