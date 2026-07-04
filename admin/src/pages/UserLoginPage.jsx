/**
 * UserLoginPage
 *
 * Device-code-first user sign-in page.
 * A code is generated automatically when the page loads — the user opens
 * Microsoft's device-auth URL in any browser, enters the code, and signs in
 * without a page redirect.  On success they are redirected to Outlook.
 *
 * All visible text, colours, and logo are controlled by admin settings so
 * the look and wording remain fully customisable.
 */
import { useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Copy, CheckCircle2, ExternalLink, Clock, RefreshCw, XCircle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { API_BASE } from '../api/client'

// ── Appearance defaults (used before settings load or if the fetch fails) ──────
const DEFAULTS = {
  login_page_title:        'Sign in',
  login_page_subtitle:     'Use your Outlook account to continue',
  login_page_badge_text:   'OUTLOOK MAIL',
  login_page_button_text:  'Sign in with Microsoft',
  login_page_step1_label:  'Step 1 — Copy this code',
  login_page_step2_label:  'Step 2 — Open this page',
  login_page_waiting_text:    'Waiting for sign-in…',
  login_page_footer_text:     'Your Outlook email and display name will be used as your account details. No separate password required.',
  login_page_bg_color:        '#0f0f1a',
  login_page_card_color:      '#1a1a2e',
  login_page_accent_color:    '#0078d4',
  login_page_logo_url:        '',
  login_page_auto_open_link:  true,
}

// Format seconds as M:SS
function fmtTime(s) {
  const m   = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function MicrosoftLogo({ size = 20 }) {
  const s = size / 2
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1"      y="1"      width={s - 1} height={s - 1} fill="#f25022" />
      <rect x={s + 1}  y="1"      width={s - 1} height={s - 1} fill="#7fba00" />
      <rect x="1"      y={s + 1}  width={s - 1} height={s - 1} fill="#00a4ef" />
      <rect x={s + 1}  y={s + 1}  width={s - 1} height={s - 1} fill="#ffb900" />
    </svg>
  )
}

function DefaultOutlookIcon({ accentColor }) {
  return (
    <div
      className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
      style={{
        background:  `${accentColor}1a`,
        border:      `1px solid ${accentColor}4d`,
        boxShadow:   `0 8px 24px ${accentColor}1a`,
      }}
    >
      <svg viewBox="0 0 32 32" width="36" height="36" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="4" fill={accentColor} />
        <ellipse cx="13" cy="16" rx="6"  ry="7"   fill="white" />
        <ellipse cx="13" cy="16" rx="4"  ry="5.2" fill={accentColor} />
        <rect x="19" y="9" width="8" height="14" rx="1" fill="white" opacity="0.9" />
        <line x1="19" y1="13" x2="27" y2="13" stroke={accentColor} strokeWidth="1" />
        <line x1="19" y1="16" x2="27" y2="16" stroke={accentColor} strokeWidth="1" />
        <line x1="19" y1="19" x2="24" y2="19" stroke={accentColor} strokeWidth="1" />
      </svg>
    </div>
  )
}

export default function UserLoginPage() {
  const location = useLocation()
  const setAuth  = useAuthStore(s => s.setAuth)

  // ── Appearance settings ──────────────────────────────────────────────────────
  const [cfg, setCfg] = useState(DEFAULTS)

  useEffect(() => {
    fetch(`${API_BASE}/settings/login-page`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.settings) setCfg(prev => ({ ...prev, ...data.settings })) })
      .catch(() => {})
  }, [])

  // ── OAuth redirect error (from legacy redirect flow) ─────────────────────────
  const [oauthError, setOauthError] = useState(null)
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const err    = params.get('oauth_error')
    if (!err) return
    if (err === 'admin_required') {
      setOauthError('Your organization requires admin approval before this app can be used. Please ask your Microsoft 365 IT admin to approve the app.')
    } else {
      setOauthError(decodeURIComponent(err))
    }
  }, [location.search])

  // ── Device code state ────────────────────────────────────────────────────────
  const [phase,       setPhase]       = useState('loading')  // loading|ready|success|expired|declined|error
  const [userCode,    setUserCode]    = useState('')
  const [verifyUrl,   setVerifyUrl]   = useState('')
  const [dcToken,     setDcToken]     = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [pollInt,     setPollInt]     = useState(5)
  const [copied,      setCopied]      = useState(false)
  const [errorMsg,    setErrorMsg]    = useState('')

  const pollTimer      = useRef(null)
  const countdownTimer = useRef(null)
  const dcTokenRef     = useRef('')
  const pollIntRef     = useRef(5)

  useEffect(() => { dcTokenRef.current  = dcToken  }, [dcToken])
  useEffect(() => { pollIntRef.current  = pollInt  }, [pollInt])

  function clearTimers() {
    clearInterval(pollTimer.current)
    clearInterval(countdownTimer.current)
  }

  // ── Fetch code ───────────────────────────────────────────────────────────────
  async function fetchCode() {
    clearTimers()
    setPhase('loading')
    setErrorMsg('')
    setCopied(false)

    try {
      const res  = await fetch(`${API_BASE}/auth/microsoft/device-code/user-start`, { method: 'POST' })
      const data = await res.json()

      if (!res.ok || data.error) {
        setPhase('error')
        setErrorMsg(data.message ?? data.error ?? 'Could not fetch sign-in code. Check Azure settings.')
        return
      }

      setUserCode(data.user_code)
      setVerifyUrl(data.verification_uri)
      setDcToken(data.device_code_token)
      setSecondsLeft(data.expires_in ?? 900)
      setPollInt(data.interval ?? 5)
      setPhase('ready')
    } catch {
      setPhase('error')
      setErrorMsg('Could not reach the server. Please try again.')
    }
  }

  // Auto-fetch on mount
  useEffect(() => {
    fetchCode()
    return clearTimers
  }, []) // eslint-disable-line

  // ── Countdown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'ready') { clearInterval(countdownTimer.current); return }
    countdownTimer.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { clearTimers(); setPhase('expired'); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(countdownTimer.current)
  }, [phase])

  // ── Poll ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'ready') { clearInterval(pollTimer.current); return }

    async function poll() {
      try {
        const res  = await fetch(`${API_BASE}/auth/microsoft/device-code/user-poll`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ device_code_token: dcTokenRef.current }),
        })
        const data = await res.json()

        if (data.status === 'authorized') {
          clearTimers()
          setPhase('success')
          setAuth(data.token, data.user)
          // Admins land on the dashboard; regular users go straight to Outlook
          setTimeout(() => {
            if (data.user?.is_admin) {
              window.location.href = '/dashboard'
            } else {
              window.location.href = 'https://outlook.office.com'
            }
          }, 1200)
          return
        }
        if (data.status === 'expired')  { clearTimers(); setPhase('expired');  return }
        if (data.status === 'declined') { clearTimers(); setPhase('declined'); return }
        if (data.status === 'error')    {
          clearTimers(); setPhase('error')
          setErrorMsg(data.message ?? 'Authentication error.')
          return
        }
        if (data.slow_down) {
          clearInterval(pollTimer.current)
          setPollInt(i => i + 5)
        }
      } catch { /* network glitch — keep polling */ }
    }

    pollTimer.current = setInterval(poll, pollInt * 1000)
    return () => clearInterval(pollTimer.current)
  }, [phase, pollInt]) // eslint-disable-line

  // ── Copy ─────────────────────────────────────────────────────────────────────
  function handleCopy() {
    navigator.clipboard.writeText(userCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
      // Auto-open the Microsoft sign-in page after copying (admin-configurable)
      if (cfg.login_page_auto_open_link && verifyUrl) {
        window.open(verifyUrl, '_blank', 'noopener,noreferrer')
      }
    })
  }

  // ── Derived styles ───────────────────────────────────────────────────────────
  const accent      = cfg.login_page_accent_color || '#0078d4'
  const borderColor = `${accent}4d`
  const accentBg    = `${accent}0d`
  const accentBg20  = `${accent}33`

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: cfg.login_page_bg_color }}
    >
      {/* ── Logo ── */}
      <div className="mb-8 flex flex-col items-center gap-3">
        {cfg.login_page_logo_url ? (
          <img
            src={cfg.login_page_logo_url}
            alt="Logo"
            className="w-16 h-16 object-contain rounded-2xl"
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <DefaultOutlookIcon accentColor={accent} />
        )}
        {cfg.login_page_badge_text && (
          <p className="text-[13px] text-gray-500 tracking-wide uppercase">{cfg.login_page_badge_text}</p>
        )}
      </div>

      {/* ── Card ── */}
      <div
        className="w-full max-w-[400px] rounded-2xl shadow-2xl px-8 py-9"
        style={{ background: cfg.login_page_card_color, border: `1px solid ${borderColor}` }}
      >
        <h1 className="text-[22px] font-bold text-white text-center mb-1">
          {cfg.login_page_title}
        </h1>
        <p className="text-sm text-gray-400 text-center mb-6 leading-relaxed">
          {cfg.login_page_subtitle}
        </p>

        {/* OAuth redirect error banner */}
        {oauthError && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300 leading-relaxed">
            {oauthError}
          </div>
        )}

        {/* ── Loading ── */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${accent}66`, borderTopColor: 'transparent' }} />
            <p className="text-sm text-gray-500">Generating your sign-in code…</p>
          </div>
        )}

        {/* ── Ready ── */}
        {phase === 'ready' && (
          <div className="space-y-4">
            {/* Step 1 — copy code first */}
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                {cfg.login_page_step1_label}
              </p>
              <div className="flex items-stretch gap-2">
                {/* Code box */}
                <div
                  className="flex-1 flex items-center justify-center rounded-xl py-4 border"
                  style={{ background: accentBg, borderColor: `${accent}33` }}
                >
                  <span
                    className="text-3xl font-mono font-bold tracking-[0.3em] select-all"
                    style={{ color: accent }}
                  >
                    {userCode}
                  </span>
                </div>
                {/* Copy button */}
                <button
                  onClick={handleCopy}
                  title="Copy code"
                  className="flex flex-col items-center justify-center gap-1 px-3 rounded-xl border transition-colors"
                  style={{
                    background:  copied ? `${accent}20` : accentBg,
                    borderColor: `${accent}33`,
                    color:       copied ? accent : '#9ca3af',
                  }}
                >
                  {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                  <span className="text-[10px]">{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Step 2 — then open the Microsoft page */}
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                {cfg.login_page_step2_label}
              </p>
              <a
                href={verifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl transition-opacity hover:opacity-90"
                style={{ background: accent }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MicrosoftLogo size={16} />
                  <span className="text-sm font-semibold text-white truncate">
                    {cfg.login_page_button_text}
                  </span>
                </div>
                <ExternalLink size={14} className="flex-shrink-0 text-white/80" />
              </a>
            </div>

            {/* Status + timer */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="relative flex h-2 w-2">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                    style={{ background: accent }}
                  />
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: accent }} />
                </span>
                {cfg.login_page_waiting_text}
              </div>
              <div className={`flex items-center gap-1 text-xs font-mono tabular-nums ${secondsLeft < 60 ? 'text-red-400' : 'text-gray-600'}`}>
                <Clock size={11} />
                {fmtTime(secondsLeft)}
              </div>
            </div>
          </div>
        )}

        {/* ── Success ── */}
        {phase === 'success' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: `${accent}20` }}>
              <CheckCircle2 size={32} style={{ color: accent }} />
            </div>
            <div>
              <p className="text-white font-semibold text-lg">Signed in!</p>
              <p className="text-sm text-gray-400 mt-1">Redirecting you to Outlook…</p>
            </div>
          </div>
        )}

        {/* ── Expired ── */}
        {phase === 'expired' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-14 h-14 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <Clock size={28} className="text-yellow-400" />
            </div>
            <div>
              <p className="text-white font-semibold">Code Expired</p>
              <p className="text-sm text-gray-400 mt-1">The code timed out before it was used.</p>
            </div>
            <button
              onClick={fetchCode}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: accentBg20, color: accent }}
            >
              <RefreshCw size={14} /> Get New Code
            </button>
          </div>
        )}

        {/* ── Declined ── */}
        {phase === 'declined' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
              <XCircle size={28} className="text-red-400" />
            </div>
            <div>
              <p className="text-white font-semibold">Sign-in Cancelled</p>
              <p className="text-sm text-gray-400 mt-1">The request was declined on Microsoft's page.</p>
            </div>
            <button
              onClick={fetchCode}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: accentBg20, color: accent }}
            >
              <RefreshCw size={14} /> Try Again
            </button>
          </div>
        )}

        {/* ── Error ── */}
        {phase === 'error' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
              <XCircle size={28} className="text-red-400" />
            </div>
            <div>
              <p className="text-white font-semibold">Something went wrong</p>
              {errorMsg && (
                <p className="text-xs text-gray-500 mt-2 leading-relaxed max-w-[280px] mx-auto">{errorMsg}</p>
              )}
            </div>
            <button
              onClick={fetchCode}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: accentBg20, color: accent }}
            >
              <RefreshCw size={14} /> Try Again
            </button>
          </div>
        )}

        {/* ── Footer ── */}
        {cfg.login_page_footer_text && (
          <p className="mt-6 text-center text-[11px] text-gray-600 leading-relaxed">
            {cfg.login_page_footer_text}
          </p>
        )}
      </div>
    </div>
  )
}
