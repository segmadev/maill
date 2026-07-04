import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Inbox, Send, FileText, Trash2, AlertCircle, Folder,
  ChevronDown, ChevronRight, Plus, RefreshCw, Link2,
  PenSquare, Settings, Tag, PanelLeftClose,
  Search, X, Monitor,
} from 'lucide-react'
import toast from 'react-hot-toast'
import useMailStore from '../../store/mailStore'
import { useAuthStore } from '../../store/authStore'
import { getMyAccounts, getFolders, getMicrosoftRedirectUrl, getDrafts, getKeywords, addKeyword } from '../../api/mail'
import { colorConfig } from './KeywordManager'
import Spinner from '../ui/Spinner'
import DeviceCodeModal from './DeviceCodeModal'

// ── sessionStorage TTL cache helpers ─────────────────────────────────────────
function ssGet(key) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const { data, expires } = JSON.parse(raw)
    if (Date.now() > expires) { sessionStorage.removeItem(key); return null }
    return data
  } catch { return null }
}
function ssSet(key, data, ttlSeconds = 300) {
  try { sessionStorage.setItem(key, JSON.stringify({ data, expires: Date.now() + ttlSeconds * 1000 })) }
  catch { /* quota exceeded */ }
}
function ssDel(key) {
  try { sessionStorage.removeItem(key) } catch { /* ignore */ }
}

// ── Token status (frontend, matches backend 30-min threshold) ─────────────────
function getTokenStatus(account) {
  if (account.token_status) return account.token_status
  if (!account.token_expires_at) return 'unknown'
  const exp = new Date(account.token_expires_at).getTime()
  const now = Date.now()
  if (exp < now)                       return 'expired'
  if (exp < now + 30 * 60 * 1000)     return 'expiring'   // < 30 min
  return 'valid'
}

const STATUS_DOT = {
  valid:    'bg-emerald-400',
  expiring: 'bg-yellow-400',
  expired:  'bg-red-500',
  unknown:  'bg-gray-600',
}

// ── Folder helpers ────────────────────────────────────────────────────────────
const FOLDER_ICONS = {
  inbox:        Inbox,
  sentitems:    Send,
  drafts:       FileText,
  deleteditems: Trash2,
  junkemail:    AlertCircle,
}
function folderIcon(name) {
  return FOLDER_ICONS[name?.toLowerCase().replace(/[^a-z]/g, '')] ?? Folder
}
function folderSortKey(name) {
  const order = { inbox: 0, drafts: 1, sentitems: 2, junkemail: 3, deleteditems: 4 }
  return order[name?.toLowerCase().replace(/[^a-z]/g, '')] ?? 99
}
function fmtDraftLabel(draft) {
  if (draft.subject?.trim()) return draft.subject
  if (draft.to?.length)       return `To: ${draft.to[0]?.email}`
  return '(No subject)'
}

// =============================================================================
export default function MailSidebar({ onManageKeywords, onCollapse }) {
  const {
    accounts, folders, activeFolderKey, activeKeyword, activeView,
    setAccounts, setFolders, setActiveFolderKey,
    drafts, setDrafts, setCompose,
    keywords, setKeywords, setActiveKeyword,
  } = useMailStore()

  const isAdmin = useAuthStore(s => s.user?.is_admin ?? false)

  const [expanded,     setExpanded]     = useState({})
  const [draftsOpen,   setDraftsOpen]   = useState(false)
  const [labelsOpen,   setLabelsOpen]   = useState(true)
  const [loading,      setLoading]      = useState(false)
  const [refreshing,   setRefreshing]   = useState(null)
  const [connecting,     setConnecting]     = useState(false)
  const [deviceCodeOpen, setDeviceCodeOpen] = useState(false)
  const [pendingInbox, setPendingInbox] = useState(null)

  // Search state — hidden by default, expands when the icon is clicked
  const [searchOpen, setSearchOpen] = useState(false)
  const [search,     setSearch]     = useState('')
  const searchInputRef = useRef(null)

  // Quick-add label state
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickText,    setQuickText]    = useState('')
  const [quickColor,   setQuickColor]   = useState('blue')
  const [quickAdding,  setQuickAdding]  = useState(false)
  const quickInputRef = useRef(null)

  const accountsCacheKey = isAdmin ? 'mail_accounts_admin' : 'mail_accounts'

  // ── Boot ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Check if navigated here from Accounts page with a target account
    const targetId = sessionStorage.getItem('sidebar_open_inbox')
    if (targetId) {
      sessionStorage.removeItem('sidebar_open_inbox')
      setPendingInbox(parseInt(targetId, 10))
    }

    loadAccounts()
    loadDrafts()
    loadKeywords()

    function handleReload() { ssDel(accountsCacheKey); loadAccounts() }
    window.addEventListener('reload-mail-accounts', handleReload)
    return () => window.removeEventListener('reload-mail-accounts', handleReload)
  }, []) // eslint-disable-line

  // Focus the search input when the search bar opens
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [searchOpen])

  // When a pending inbox target is set and accounts are loaded,
  // ensure folders are being fetched for that account.
  useEffect(() => {
    if (!pendingInbox || !accounts.length) return
    setExpanded(e => ({ ...e, [pendingInbox]: true }))
    if (!folders[pendingInbox]) loadFolders(pendingInbox)
  }, [accounts.length, pendingInbox]) // eslint-disable-line

  // Once folders arrive for the pending account, jump to its inbox.
  useEffect(() => {
    if (!pendingInbox) return
    const accountFolders = folders[pendingInbox]
    if (accountFolders) {
      jumpToInbox(pendingInbox, accountFolders)
      setPendingInbox(null)
    }
  }, [folders, pendingInbox]) // eslint-disable-line

  // ── Data loaders ────────────────────────────────────────────────────────────
  async function loadAccounts() {
    const cached = ssGet(accountsCacheKey)
    if (cached) {
      setAccounts(cached)
      if (cached.length) {
        setExpanded({ [cached[0].id]: true })
        loadFolders(cached[0].id)
      }
      return
    }
    setLoading(true)
    try {
      const data = await getMyAccounts()
      const list = data.accounts ?? []
      setAccounts(list)
      ssSet(accountsCacheKey, list, 300)
      if (list.length) {
        setExpanded({ [list[0].id]: true })
        loadFolders(list[0].id)
      }
    } catch {
      toast.error('Failed to load accounts.')
    } finally {
      setLoading(false)
    }
  }

  async function loadFolders(accountId, force = false) {
    const cacheKey = `mail_folders_${accountId}`
    if (!force) {
      if (folders[accountId]) return
      const cached = ssGet(cacheKey)
      if (cached) { setFolders(accountId, cached); return }
    }
    if (force) { ssDel(cacheKey); setRefreshing(accountId) }
    try {
      const data = await getFolders(accountId, force)
      const list = data.folders ?? []
      setFolders(accountId, list)
      ssSet(cacheKey, list, 300)
    } catch (err) {
      const msg = err.response?.data?.message ?? ''
      if (msg.includes('graph_unauthorized') || err.response?.status === 503) {
        toast.error('Microsoft token expired. Please reconnect this account.', { duration: 6000 })
      } else {
        toast.error('Failed to load folders.')
      }
    } finally {
      setRefreshing(null)
    }
  }

  async function loadDrafts() {
    try { const d = await getDrafts(); setDrafts(d.drafts ?? []) } catch { /* non-critical */ }
  }
  async function loadKeywords() {
    try { const d = await getKeywords(); setKeywords(d.keywords ?? []) } catch { /* non-critical */ }
  }

  // ── Inbox navigation ────────────────────────────────────────────────────────
  function jumpToInbox(accountId, accountFolders) {
    const inbox = (accountFolders ?? []).find(
      f => f.display_name?.toLowerCase().replace(/[^a-z]/g, '') === 'inbox'
    )
    if (inbox) setActiveFolderKey(`${accountId}:${inbox.graph_folder_id}`)
  }

  function navigateToInbox(accountId) {
    setExpanded(e => ({ ...e, [accountId]: true }))
    if (folders[accountId]) {
      jumpToInbox(accountId, folders[accountId])
    } else {
      setPendingInbox(accountId)
      loadFolders(accountId)
    }
  }

  function toggleExpand(e, accountId) {
    e.stopPropagation()
    const next = !expanded[accountId]
    setExpanded(ex => ({ ...ex, [accountId]: next }))
    if (next) loadFolders(accountId)
  }

  async function handleConnect() {
    setConnecting(true)
    try {
      const data = await getMicrosoftRedirectUrl()
      window.location.href = data.url
    } catch (err) {
      const code = err.response?.data?.error
      toast.error(
        code === 'azure_not_configured'
          ? 'Azure not configured. Go to Settings → Azure / Microsoft OAuth.'
          : (err.response?.data?.message ?? 'OAuth failed.'),
        { duration: 6000 }
      )
      setConnecting(false)
    }
  }

  function closeSearch() {
    setSearchOpen(false)
    setSearch('')
  }

  function openQuickAdd() {
    setQuickAddOpen(true)
    setQuickText('')
    setTimeout(() => quickInputRef.current?.focus(), 50)
  }

  function closeQuickAdd() {
    setQuickAddOpen(false)
    setQuickText('')
  }

  async function handleQuickAdd() {
    const val = quickText.trim().toLowerCase()
    if (!val) return
    setQuickAdding(true)
    try {
      const res = await addKeyword(val, quickColor)
      setKeywords(
        [...keywords.filter(k => k.id !== res.keyword.id), res.keyword]
          .sort((a, b) => a.keyword.localeCompare(b.keyword))
      )
      toast.success(`"${res.keyword.keyword}" added.`)
      closeQuickAdd()
    } catch (err) {
      const status = err.response?.status
      if (status === 409 || status === 422) toast(`"${val}" already exists.`, { icon: 'ℹ️' })
      else toast.error('Failed to add label.')
    } finally {
      setQuickAdding(false)
    }
  }

  // ── Inbox unread count (from already-loaded folders) ────────────────────────
  function getInboxUnread(accountId) {
    const acctFolders = folders[accountId]
    if (!acctFolders) return 0
    const inbox = acctFolders.find(
      f => f.display_name?.toLowerCase().replace(/[^a-z]/g, '') === 'inbox'
    )
    return inbox?.unread_items ?? 0
  }

  // ── Filtered accounts ────────────────────────────────────────────────────────
  const filteredAccounts = useMemo(() => {
    if (!search.trim()) return accounts
    const q = search.toLowerCase()
    return accounts.filter(a =>
      a.email?.toLowerCase().includes(q) ||
      a.display_name?.toLowerCase().includes(q) ||
      a.owner_name?.toLowerCase().includes(q) ||
      a.owner_email?.toLowerCase().includes(q)
    )
  }, [accounts, search])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full w-full bg-surface overflow-hidden">

      {/* ── Header ── */}
      <div className="px-3 py-2.5 border-b border-surface-border flex items-center justify-between flex-shrink-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {isAdmin ? 'All Mailboxes' : 'My Mailboxes'}
        </p>
        <div className="flex items-center gap-1">
          {/* Search toggle */}
          <button
            onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)}
            title={searchOpen ? 'Close search' : 'Search accounts'}
            className={`p-1 rounded hover:bg-surface-raised transition-colors ${
              searchOpen ? 'text-brand' : 'text-gray-600 hover:text-white'
            }`}
          >
            {searchOpen ? <X size={12} /> : <Search size={12} />}
          </button>
          {onCollapse && (
            <button
              onClick={onCollapse}
              title="Collapse sidebar"
              className="p-0.5 rounded hover:bg-surface-raised text-gray-600 hover:text-white transition-colors"
            >
              <PanelLeftClose size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Expandable search input ── */}
      {searchOpen && (
        <div className="px-3 py-2 border-b border-surface-border flex-shrink-0">
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isAdmin ? 'Search by email or owner…' : 'Search accounts…'}
              className="w-full bg-surface border border-surface-border rounded-lg pl-7 pr-7 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand/50 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <X size={11} />
              </button>
            )}
          </div>
          {search && (
            <p className="text-[10px] text-gray-600 mt-1.5 px-0.5">
              {filteredAccounts.length} of {accounts.length} accounts
            </p>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">

        {/* ── Accounts & Folders ── */}
        {loading ? (
          <div className="flex justify-center py-8"><Spinner size={20} /></div>
        ) : accounts.length === 0 ? (
          <div className="px-4 py-6 text-center space-y-2">
            <p className="text-xs text-gray-500">No accounts connected</p>
            <button onClick={handleConnect} disabled={connecting}
              className="text-xs text-brand hover:underline flex items-center gap-1 mx-auto">
              <Link2 size={11} /> Connect account
            </button>
            <button onClick={() => setDeviceCodeOpen(true)}
              className="text-[11px] text-gray-600 hover:text-gray-400 flex items-center gap-1 mx-auto">
              <Monitor size={11} /> Use device code
            </button>
          </div>
        ) : (
          <>
            {search && filteredAccounts.length === 0 && (
              <div className="px-4 py-5 text-center">
                <p className="text-xs text-gray-600">No accounts match "{search}"</p>
                <button onClick={() => setSearch('')} className="text-xs text-brand hover:underline mt-1">
                  Clear
                </button>
              </div>
            )}

            {filteredAccounts.map(account => {
              const status      = getTokenStatus(account)
              const dot         = STATUS_DOT[status] ?? STATUS_DOT.unknown
              const inboxUnread = getInboxUnread(account.id)

              return (
                <div key={account.id} className="mb-0.5">

                  {/* Account row */}
                  <div className="flex items-center gap-1 px-2 group">

                    {/* Left: click → inbox */}
                    <button
                      onClick={() => navigateToInbox(account.id)}
                      title={`Open ${account.email} inbox`}
                      className="flex items-center gap-2 flex-1 min-w-0 px-1 py-1.5 rounded-lg hover:bg-surface-raised transition-colors text-left"
                    >
                      {/* Avatar + status dot */}
                      <div className="relative flex-shrink-0">
                        <div className="w-6 h-6 rounded-full bg-white text-black text-[9px] font-bold uppercase flex items-center justify-center">
                          {account.email?.[0]}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-[1.5px] border-surface ${dot}`}
                          title={status}
                        />
                      </div>

                      {/* Email + owner */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-200 truncate leading-tight">
                          {account.email}
                        </p>
                        {isAdmin && account.owner_name && (
                          <p className="text-[10px] text-gray-600 truncate leading-tight">
                            {account.owner_name}
                          </p>
                        )}
                      </div>
                    </button>

                    {/* Inbox unread count — always visible when > 0, hides behind hover controls */}
                    {inboxUnread > 0 && (
                      <span className="flex-shrink-0 text-[8px] bg-brand/80 text-white rounded-full px-1 leading-[13px] font-bold group-hover:opacity-0 transition-opacity pointer-events-none min-w-[14px] text-center">
                        {inboxUnread > 99 ? '99+' : inboxUnread}
                      </span>
                    )}

                    {/* Right controls (visible on hover) */}
                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Inbox shortcut icon */}
                      <button
                        onClick={() => navigateToInbox(account.id)}
                        title="Go to Inbox"
                        className="p-1 rounded hover:bg-surface-raised text-white hover:text-white transition-colors"
                      >
                        <Inbox size={11} />
                      </button>

                      {/* Refresh folders */}
                      {refreshing === account.id
                        ? <Spinner size={10} />
                        : (
                          <button
                            onClick={e => { e.stopPropagation(); loadFolders(account.id, true) }}
                            title="Refresh folders"
                            className="p-1 rounded hover:bg-surface-raised text-gray-500 hover:text-white transition-colors"
                          >
                            <RefreshCw size={10} />
                          </button>
                        )
                      }
                    </div>

                    {/* Chevron — always visible */}
                    <button
                      onClick={e => toggleExpand(e, account.id)}
                      title={expanded[account.id] ? 'Collapse' : 'Expand'}
                      className="p-1 rounded hover:bg-surface-raised text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
                    >
                      {expanded[account.id]
                        ? <ChevronDown  size={11} />
                        : <ChevronRight size={11} />
                      }
                    </button>
                  </div>

                  {/* Folder list */}
                  {expanded[account.id] && (
                    <div className="ml-2">
                      {(folders[account.id] ?? []).length === 0 && refreshing !== account.id && (
                        <p className="text-[10px] text-gray-600 px-3 py-1.5">No folders loaded.</p>
                      )}
                      {(folders[account.id] ?? [])
                        .slice()
                        .sort((a, b) => folderSortKey(a.display_name) - folderSortKey(b.display_name))
                        .map(folder => {
                          const key    = `${account.id}:${folder.graph_folder_id}`
                          const active = activeFolderKey === key && activeView === 'folder'
                          const Icon   = folderIcon(folder.display_name)
                          return (
                            <button
                              key={folder.id}
                              onClick={() => setActiveFolderKey(key)}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left rounded-sm mx-1 text-xs  ${
                                active
                                  ? 'bg-brand/15 text-brand font-medium'
                                  : 'text-gray-400  hover:text-gray-200'
                              }`}
                            >
                              <Icon size={12} className="flex-shrink-0" />
                              <span className="flex-1 truncate">{folder.display_name}</span>
                              {folder.unread_items > 0 && (
                                <span className="text-[9px] bg-brand text-black rounded-full px-1.5 py-0.5 font-semibold">
                                  {folder.unread_items > 99 ? '99+' : folder.unread_items}
                                </span>
                              )}
                            </button>
                          )
                        })}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* ── Local Drafts ── */}
        <div className="mt-2 border-t border-surface-border pt-2">
          <button
            onClick={() => setDraftsOpen(o => !o)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-400 hover:text-gray-200 hover:bg-surface-raised transition-colors"
          >
            <PenSquare size={12} className="flex-shrink-0" />
            <span className="flex-1 font-medium">Local Drafts</span>
            {drafts.length > 0 && (
              <span className="text-[9px] bg-surface-border text-gray-400 rounded-full px-1.5 py-0.5">{drafts.length}</span>
            )}
            {draftsOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>

          {draftsOpen && (
            <div className="ml-2">
              {drafts.length === 0
                ? <p className="text-[10px] text-gray-600 px-3 py-2">No saved drafts</p>
                : drafts.map(draft => (
                    <button
                      key={draft.id}
                      onClick={() => setCompose({ mode: 'draft', draft })}
                      className="w-full text-left px-3 py-1.5 rounded-lg mx-1 text-xs text-gray-400 hover:bg-surface-raised hover:text-gray-200 transition-colors truncate"
                      title={fmtDraftLabel(draft)}
                    >
                      {fmtDraftLabel(draft)}
                    </button>
                  ))
              }
              <button
                onClick={() => setCompose({ mode: 'new' })}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-brand hover:text-brand/80 mx-1"
              >
                <Plus size={11} /> New draft
              </button>
            </div>
          )}
        </div>

        {/* ── Smart Labels ── */}
        <div className="mt-1 border-t border-surface-border pt-2">
          <div className="flex items-center px-3 py-1.5">
            <button
              onClick={() => setLabelsOpen(o => !o)}
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 flex-1 text-left"
            >
              <Tag size={12} className="flex-shrink-0" />
              <span className="font-medium">Smart Labels</span>
              {labelsOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </button>
            {/* Quick-add button */}
            <button
              onClick={quickAddOpen ? closeQuickAdd : openQuickAdd}
              title={quickAddOpen ? 'Cancel' : 'Quick add label'}
              className={`p-0.5 rounded hover:bg-surface-raised transition-colors ${quickAddOpen ? 'text-brand' : 'text-gray-600 hover:text-gray-300'}`}
            >
              {quickAddOpen ? <X size={11} /> : <Plus size={11} />}
            </button>
            <button
              onClick={onManageKeywords}
              className="p-0.5 rounded hover:bg-surface-raised text-gray-600 hover:text-gray-300 transition-colors ml-0.5"
              title="Manage all labels"
            >
              <Settings size={11} />
            </button>
          </div>

          {/* Quick-add inline form */}
          {quickAddOpen && (
            <div className="px-3 pb-2">
              <div className="bg-surface-raised rounded-lg p-2 space-y-1.5 border border-surface-border">
                <input
                  ref={quickInputRef}
                  value={quickText}
                  onChange={e => setQuickText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd(); if (e.key === 'Escape') closeQuickAdd() }}
                  placeholder="Label name…"
                  className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand"
                />
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {['blue','green','red','yellow','purple','orange','pink','indigo'].map(c => {
                      const dotColors = {
                        blue: 'bg-blue-400', green: 'bg-green-400', red: 'bg-red-400',
                        yellow: 'bg-yellow-400', purple: 'bg-purple-400', orange: 'bg-orange-400',
                        pink: 'bg-pink-400', indigo: 'bg-indigo-400',
                      }
                      return (
                        <button
                          key={c}
                          onClick={() => setQuickColor(c)}
                          className={`w-3.5 h-3.5 rounded-full ${dotColors[c]} transition-all ${
                            quickColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-surface-raised scale-110' : 'opacity-50 hover:opacity-100'
                          }`}
                        />
                      )
                    })}
                  </div>
                  <button
                    onClick={handleQuickAdd}
                    disabled={quickAdding || !quickText.trim()}
                    className="px-2 py-0.5 rounded bg-brand/15 text-brand hover:bg-brand/25 text-[10px] font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {quickAdding ? <Spinner size={9} /> : null}
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {labelsOpen && (
            <div className="ml-2">
              {keywords.length === 0 ? (
                <button
                  onClick={onManageKeywords}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-left text-gray-600 hover:text-gray-400 mx-1"
                >
                  <Plus size={10} /> Add keyword
                </button>
              ) : keywords.map(kw => {
                const cfg    = colorConfig(kw.color)
                const active = activeView === 'keyword' && activeKeyword === kw.keyword
                return (
                  <button
                    key={kw.id}
                    onClick={() => setActiveKeyword(kw.keyword)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg mx-1 text-xs text-left transition-colors ${
                      active ? `${cfg.bg} ${cfg.text} font-medium` : 'text-gray-400 hover:bg-surface-raised hover:text-gray-200'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${cfg.dot} flex-shrink-0`} />
                    <span className="flex-1 truncate">{kw.keyword}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {/* ── Footer ── */}
      <div className="border-t border-surface-border p-2 space-y-0.5">
        {/* Standard OAuth — browser redirect */}
        <button
          onClick={handleConnect}
          disabled={connecting}
          title="Connect via browser redirect (standard OAuth)"
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-surface-raised hover:text-white transition-colors disabled:opacity-50"
        >
          <Link2 size={12} />
          {connecting ? 'Redirecting…' : 'Connect account'}
        </button>

        {/* Device Code — for org accounts blocked by admin consent policies */}
        <button
          onClick={() => setDeviceCodeOpen(true)}
          title="Connect via device code — works for Microsoft 365 org accounts that block standard sign-in"
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-gray-600 hover:bg-surface-raised hover:text-gray-300 transition-colors"
        >
          <Monitor size={11} />
          Connect with device code
        </button>
      </div>

      {/* Device Code modal */}
      <DeviceCodeModal
        open={deviceCodeOpen}
        onClose={() => setDeviceCodeOpen(false)}
      />
    </div>
  )
}
