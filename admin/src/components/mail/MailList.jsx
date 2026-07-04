import { useEffect, useCallback, useRef, useState } from 'react'
import { Paperclip, Flag, Star, Tag, RefreshCw, PanelLeftClose } from 'lucide-react'
import toast from 'react-hot-toast'
import useMailStore from '../../store/mailStore'
import { getEmails, getEmail, markRead, getKeywordMatches } from '../../api/mail'
import { colorConfig } from './KeywordManager'
import Spinner from '../ui/Spinner'

/** Returns the subset of keywords whose text appears in the email subject or preview. */
function matchKeywords(email, keywords) {
  if (!keywords.length) return []
  const haystack = `${email.subject ?? ''} ${email.body_preview ?? ''}`.toLowerCase()
  return keywords.filter(kw => haystack.includes(kw.keyword.toLowerCase()))
}

function fmt(iso) {
  if (!iso) return ''
  const d   = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const diff = (now - d) / 86400000
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Keyword / Smart-Label view ────────────────────────────────────────────────
function KeywordView({ onCollapse }) {
  const {
    activeKeyword, keywordEmails, keywords, setKeywordEmails,
    openEmail, setOpenEmail, setLoadingEmail, markReadLocal,
  } = useMailStore()

  const [loading,     setLoading]     = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  // Load on mount + whenever the active keyword changes; auto-refresh every 2 min.
  useEffect(() => {
    loadMatches()
    const interval = setInterval(loadMatches, 120_000)
    return () => clearInterval(interval)
  }, [activeKeyword]) // eslint-disable-line

  async function loadMatches() {
    setLoading(true)
    try {
      const data = await getKeywordMatches()
      const filtered = activeKeyword
        ? (data.emails ?? []).filter(e => (e.matched_keywords ?? []).includes(activeKeyword))
        : (data.emails ?? [])
      setKeywordEmails(filtered)
      setLastUpdated(new Date())
    } catch {
      toast.error('Failed to load keyword matches.')
    } finally {
      setLoading(false)
    }
  }

  async function openMessage(email) {
    setOpenEmail(email)
    setLoadingEmail(true)
    if (!email.is_read) {
      markRead(email.id).catch(() => {})
      markReadLocal(email.id, true)
    }
    try {
      const data = await getEmail(email.id)
      setOpenEmail(data.email)
    } catch {
      toast.error('Failed to load email.')
    } finally {
      setLoadingEmail(false)
    }
  }

  function fmtAge(date) {
    if (!date) return null
    const secs = Math.floor((Date.now() - date) / 1000)
    if (secs < 60)  return 'just now'
    if (secs < 120) return '1 min ago'
    return `${Math.floor(secs / 60)} min ago`
  }

  const activeCfg = colorConfig(keywords.find(k => k.keyword === activeKeyword)?.color ?? 'blue')

  return (
    <div className="w-full flex flex-col h-full bg-surface overflow-hidden">
      {/* Header — two rows so a long keyword name never pushes meta out of frame */}
      <div className="px-4 pt-2.5 pb-2 border-b border-surface-border space-y-1 flex-shrink-0">
        {/* Row 1: keyword label + collapse + refresh */}
        <div className="flex items-center gap-1.5 min-w-0">
          <Tag size={11} className={`flex-shrink-0 ${activeCfg.text}`} />
          <span className={`text-xs font-semibold truncate flex-1 ${activeCfg.text}`}>
            {activeKeyword ?? 'All keywords'}
          </span>
          <button
            onClick={loadMatches}
            disabled={loading}
            title="Refresh now"
            className="flex-shrink-0 p-0.5 rounded hover:bg-surface-raised text-gray-600 hover:text-gray-300 transition-colors"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
          {onCollapse && (
            <button
              onClick={onCollapse}
              title="Collapse message list"
              className="flex-shrink-0 p-0.5 rounded hover:bg-surface-raised text-gray-600 hover:text-white transition-colors"
            >
              <PanelLeftClose size={12} />
            </button>
          )}
        </div>
        {/* Row 2: match count + last-updated age */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-500">
            {keywordEmails.length} match{keywordEmails.length !== 1 ? 'es' : ''}
          </span>
          {lastUpdated && (
            <span className="text-[10px] text-gray-600">{fmtAge(lastUpdated)}</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && keywordEmails.length === 0 ? (
          <div className="flex justify-center py-12"><Spinner size={20} /></div>
        ) : keywordEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16">
            <Tag size={20} className="text-gray-600 mb-2" />
            <p className="text-xs text-gray-600">No emails match this keyword</p>
          </div>
        ) : keywordEmails.map(email => {
          const active = openEmail?.id === email.id
          return (
            <button
              key={email.id}
              onClick={() => openMessage(email)}
              className={`w-full text-left px-4 py-3 border-b border-surface-border/50 transition-colors
                ${active ? 'bg-brand/10 border-l-2 border-l-brand' : 'hover:bg-surface-raised/50'}`}
            >
              <div className="flex items-start gap-2">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${email.is_read ? 'bg-transparent' : 'bg-brand'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className={`text-xs truncate ${email.is_read ? 'text-gray-400 font-normal' : 'text-white font-semibold'}`}>
                      {email.sender_name || email.sender_email || 'Unknown'}
                    </span>
                    <span className="text-[10px] text-gray-600 flex-shrink-0">{fmt(email.received_at)}</span>
                  </div>
                  <p className={`text-xs truncate mb-1 ${email.is_read ? 'text-gray-500' : 'text-gray-200'}`}>
                    {email.subject || '(No subject)'}
                  </p>
                  <div className="flex flex-wrap gap-0.5">
                    {(email.matched_keywords ?? []).map(kw => {
                      const c = colorConfig(keywords.find(k => k.keyword === kw)?.color ?? 'blue')
                      return <span key={kw} className={`text-[9px] px-1.5 py-0.5 rounded-full ${c.bg} ${c.text}`}>{kw}</span>
                    })}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Folder view (default) ─────────────────────────────────────────────────────
export default function MailList({ onCollapse }) {
  const {
    activeView,
    emails, emailsTotal, emailsPage, loadingEmails,
    activeFolderKey, openEmail,
    setEmails, appendEmails, setEmailsPage, setLoadingEmails,
    setOpenEmail, setLoadingEmail, markReadLocal, getActiveFolder,
    keywords,
  } = useMailStore()

  // All hooks must come before any conditional return (Rules of Hooks).
  const perPage  = 50
  const sentinel = useRef(null)

  const loadPage = useCallback(async (page = 1, append = false) => {
    const active = getActiveFolder()
    if (!active) return
    setLoadingEmails(true)
    try {
      const data = await getEmails(active.accountId, active.folderId, page, perPage)
      if (append) appendEmails(data.emails, data.total)
      else        setEmails(data.emails, data.total)
      setEmailsPage(page)
    } catch {
      toast.error('Failed to load emails.')
    } finally {
      setLoadingEmails(false)
    }
  }, [activeFolderKey]) // eslint-disable-line

  useEffect(() => {
    if (activeFolderKey && activeView === 'folder') loadPage(1, false)
  }, [activeFolderKey, activeView]) // eslint-disable-line

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !loadingEmails && emails.length < emailsTotal)
        loadPage(emailsPage + 1, true)
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadingEmails, emails.length, emailsTotal, emailsPage]) // eslint-disable-line

  // NOW it's safe to delegate to the keyword view (all hooks already called above).
  if (activeView === 'keyword') return <KeywordView onCollapse={onCollapse} />

  async function openMessage(email) {
    setOpenEmail(email)
    setLoadingEmail(true)
    if (!email.is_read) {
      markRead(email.id).catch(() => {})
      markReadLocal(email.id, true)
    }
    try {
      const data = await getEmail(email.id)
      setOpenEmail(data.email)
    } catch {
      toast.error('Failed to load email.')
    } finally {
      setLoadingEmail(false)
    }
  }

  if (!activeFolderKey) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-surface">
        <p className="text-xs text-gray-600">Select a folder</p>
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col h-full bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-surface-border flex items-center justify-between flex-shrink-0">
        <p className="text-xs text-gray-500">{emailsTotal} messages</p>
        {onCollapse && (
          <button
            onClick={onCollapse}
            title="Collapse message list"
            className="p-0.5 rounded hover:bg-surface-raised text-gray-600 hover:text-white transition-colors"
          >
            <PanelLeftClose size={12} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loadingEmails && emails.length === 0 ? (
          <div className="flex justify-center py-12"><Spinner size={24} /></div>
        ) : emails.length === 0 ? (
          <div className="flex items-center justify-center h-full py-16">
            <p className="text-xs text-gray-600">No messages</p>
          </div>
        ) : (
          <>
            {emails.map(email => {
              const active      = openEmail?.id === email.id
              const matchedKws  = matchKeywords(email, keywords)
              return (
                <button
                  key={email.id}
                  onClick={() => openMessage(email)}
                  className={`w-full text-left px-4 py-3 border-b border-surface-border/50 transition-colors
                    ${active ? 'bg-brand/10 border-l-2 border-l-brand' : 'hover:bg-surface-raised/50'}`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${email.is_read ? 'bg-transparent' : 'bg-brand'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`text-xs truncate ${email.is_read ? 'text-gray-400 font-normal' : 'text-white font-semibold'}`}>
                          {email.sender_name || email.sender_email || 'Unknown'}
                        </span>
                        <span className="text-[10px] text-gray-600 flex-shrink-0">{fmt(email.received_at)}</span>
                      </div>
                      <p className={`text-xs truncate mb-0.5 ${email.is_read ? 'text-gray-500' : 'text-gray-200'}`}>
                        {email.subject || '(No subject)'}
                      </p>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-[11px] text-gray-600 truncate flex-1">{email.body_preview}</p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {email.has_attachments && <Paperclip size={10} className="text-gray-600" />}
                          {email.importance === 'high' && <Flag size={10} className="text-red-400" />}
                          {email.flagged && <Star size={10} className="text-yellow-400 fill-yellow-400" />}
                        </div>
                      </div>
                      {matchedKws.length > 0 && (
                        <div className="flex flex-wrap gap-0.5">
                          {matchedKws.map(kw => {
                            const c = colorConfig(kw.color)
                            return (
                              <span key={kw.id} className={`text-[9px] px-1.5 py-0.5 rounded-full ${c.bg} ${c.text}`}>
                                {kw.keyword}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
            <div ref={sentinel} className="py-2 flex justify-center">
              {loadingEmails && <Spinner size={16} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
