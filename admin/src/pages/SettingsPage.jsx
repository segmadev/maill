import { useEffect, useState } from 'react'
import {
  Save, RotateCcw, AlertTriangle, Eye, EyeOff,
  ExternalLink, CheckCircle, XCircle, Info, Copy,
  ChevronDown, ChevronRight, Building2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/layout/AdminLayout'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import { getSettings, updateSettings, resetSettings, getOAuthAccounts, setDefaultOAuthAccount } from '../api/admin'
import { OAUTH_REDIRECT_URI } from '../api/client'
import { getMicrosoftAdminConsentUrl } from '../api/mail'

const GROUP_LABELS = {
  general:    'General',
  accounts:   'Account Limits',
  sync:       'Email Sync',
  email:      'Email Sending',
  security:   'Security',
  login_page: 'User Login Page',
  azure:      'Azure / Microsoft OAuth',
}

const GROUP_ORDER = ['general', 'accounts', 'sync', 'email', 'security', 'login_page', 'azure']

export default function SettingsPage() {
  const [grouped,     setGrouped]     = useState({})
  const [pending,     setPending]     = useState({})
  const [loading,     setLoading]     = useState(true)
  const [savingGroup, setSavingGroup] = useState(null)
  const [savingAll,   setSavingAll]   = useState(false)
  const [resetModal,  setResetModal]  = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getSettings()
      setGrouped(data.settings)
      setPending({})
    } catch {
      toast.error('Failed to load settings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const change = (key, value) => setPending(p => ({ ...p, [key]: value }))

  const getValue = (key, rawValue, type) => {
    if (key in pending) return pending[key]
    if (type === 'boolean') return rawValue === '1' || rawValue === true
    if (type === 'integer') return Number(rawValue)
    return rawValue ?? ''
  }

  const pendingCountForGroup = (group) => {
    const keys = (grouped[group] ?? []).map(s => s.key)
    return keys.filter(k => k in pending).length
  }

  const totalPending = Object.keys(pending).length

  // Save only the keys belonging to a specific group, then strip them from pending.
  const saveGroup = async (group) => {
    const keys   = (grouped[group] ?? []).map(s => s.key)
    const subset = Object.fromEntries(keys.filter(k => k in pending).map(k => [k, pending[k]]))
    if (!Object.keys(subset).length) return

    setSavingGroup(group)
    try {
      await updateSettings(subset)
      toast.success(`${GROUP_LABELS[group] ?? group} saved.`)
      setPending(p => {
        const next = { ...p }
        keys.forEach(k => delete next[k])
        return next
      })
      // Reload this group from DB to get fresh raw_values
      const fresh = await getSettings()
      setGrouped(fresh.settings)
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to save.')
    } finally {
      setSavingGroup(null)
    }
  }

  const saveAll = async () => {
    if (!totalPending) return
    setSavingAll(true)
    try {
      await updateSettings(pending)
      toast.success('All settings saved.')
      load()
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to save.')
    } finally {
      setSavingAll(false)
    }
  }

  const handleReset = async () => {
    try {
      await resetSettings()
      toast.success('Settings reset to defaults.')
      setResetModal(false)
      load()
    } catch {
      toast.error('Reset failed.')
    }
  }

  if (loading) {
    return (
      <AdminLayout title="Settings">
        <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>
      </AdminLayout>
    )
  }

  const sortedGroups = GROUP_ORDER.filter(g => grouped[g])
    .concat(Object.keys(grouped).filter(g => !GROUP_ORDER.includes(g)))

  return (
    <AdminLayout title="Settings">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm">
          {totalPending > 0
            ? <span className="text-yellow-400 font-medium">{totalPending} unsaved change{totalPending > 1 ? 's' : ''}</span>
            : <span className="text-gray-600">All settings saved</span>
          }
        </p>
        <div className="flex gap-2">
          <button onClick={() => setResetModal(true)} className="btn-ghost">
            <RotateCcw size={14} /> Reset defaults
          </button>
          {totalPending > 0 && (
            <button onClick={saveAll} disabled={savingAll} className="btn-primary">
              <Save size={14} /> {savingAll ? 'Saving…' : `Save all (${totalPending})`}
            </button>
          )}
        </div>
      </div>

      {/* ── Layout: sticky nav + sections ── */}
      <div className="flex gap-6 items-start">

        {/* Left sticky nav — visible on wide screens */}
        <nav className="hidden xl:block w-44 flex-shrink-0 sticky top-4">
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-3 mb-2">
            Sections
          </p>
          <ul className="space-y-0.5">
            {sortedGroups.map(group => {
              const count = pendingCountForGroup(group)
              return (
                <li key={group}>
                  <a
                    href={`#section-${group}`}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-white hover:bg-surface-raised transition-colors group"
                  >
                    <span className="truncate">{GROUP_LABELS[group] ?? group}</span>
                    {count > 0 && (
                      <span className="ml-1.5 w-4 h-4 rounded-full bg-brand text-white text-[9px] flex items-center justify-center font-bold flex-shrink-0">
                        {count}
                      </span>
                    )}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* ── Sections ── */}
        <div className="flex-1 min-w-0 space-y-4">
          {sortedGroups.map(group => {
            const settings    = grouped[group] ?? []
            const changeCount = pendingCountForGroup(group)
            const saving      = savingGroup === group
            const onSave      = () => saveGroup(group)

            if (group === 'azure') {
              return (
                <AzureSection
                  key="azure"
                  settings={settings}
                  pending={pending}
                  getValue={getValue}
                  onChange={change}
                  changeCount={changeCount}
                  onSave={onSave}
                  saving={saving}
                />
              )
            }
            if (group === 'login_page') {
              return (
                <LoginPageSection
                  key="login_page"
                  settings={settings}
                  pending={pending}
                  getValue={getValue}
                  onChange={change}
                  changeCount={changeCount}
                  onSave={onSave}
                  saving={saving}
                />
              )
            }
            if (group === 'email') {
              return (
                <EmailSendingSection
                  key="email"
                  pending={pending}
                  onChange={change}
                  changeCount={changeCount}
                  onSave={onSave}
                  saving={saving}
                />
              )
            }
            return (
              <SectionCard
                key={group}
                id={`section-${group}`}
                title={GROUP_LABELS[group] ?? group}
                changeCount={changeCount}
                onSave={onSave}
                saving={saving}
              >
                <div className="divide-y divide-surface-border">
                  {settings.map(s => (
                    <SettingRow
                      key={s.key}
                      setting={s}
                      currentValue={getValue(s.key, s.raw_value, s.type)}
                      changed={s.key in pending}
                      onChange={val => change(s.key, val)}
                    />
                  ))}
                </div>
              </SectionCard>
            )
          })}
        </div>
      </div>

      {/* ── Reset confirm modal ── */}
      <Modal open={resetModal} onClose={() => setResetModal(false)} title="Reset Settings" size="sm">
        <div className="flex items-start gap-3 mb-5">
          <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400 flex-shrink-0">
            <AlertTriangle size={18} />
          </div>
          <p className="text-sm text-gray-300">
            This will restore all settings (except Azure credentials) to their factory defaults.
            Any customisations will be lost.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => setResetModal(false)} className="btn-ghost">Cancel</button>
          <button onClick={handleReset} className="btn-danger">Reset all settings</button>
        </div>
      </Modal>
    </AdminLayout>
  )
}

// =============================================================================
// SectionCard — collapsible card with per-section save button
// =============================================================================
function SectionCard({ id, title, badge, changeCount, onSave, saving, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div id={id} className="card scroll-mt-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-surface-border">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 flex-1 text-left min-w-0"
        >
          {open
            ? <ChevronDown  size={13} className="text-gray-500 flex-shrink-0" />
            : <ChevronRight size={13} className="text-gray-500 flex-shrink-0" />
          }
          <h2 className="text-sm font-semibold text-white truncate">{title}</h2>
          {badge}
          {changeCount > 0 && (
            <span className="text-[11px] text-brand font-medium bg-brand/10 px-2 py-0.5 rounded-full flex-shrink-0">
              {changeCount} modified
            </span>
          )}
        </button>

        {changeCount > 0 ? (
          <button
            onClick={onSave}
            disabled={saving}
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 flex-shrink-0"
          >
            <Save size={12} /> {saving ? 'Saving…' : 'Save section'}
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-gray-600 flex-shrink-0">
            <CheckCircle size={12} /> Saved
          </span>
        )}
      </div>

      {open && <div className="mt-4">{children}</div>}
    </div>
  )
}

// =============================================================================
// Login Page section — live-preview designer
// =============================================================================
function LoginPageSection({ settings, pending, getValue, onChange, changeCount, onSave, saving }) {
  const byKey = Object.fromEntries(settings.map(s => [s.key, s]))

  const val = (key) => {
    const s = byKey[key]
    if (!s) return ''
    return getValue(s.key, s.raw_value, s.type)
  }

  const title        = val('login_page_title')           || 'Sign in'
  const subtitle     = val('login_page_subtitle')        || ''
  const badgeText    = val('login_page_badge_text')      || 'OUTLOOK MAIL'
  const btnText      = val('login_page_button_text')     || 'Sign in with Microsoft'
  const step1Label   = val('login_page_step1_label')     || 'Step 1 — Copy this code'
  const step2Label   = val('login_page_step2_label')     || 'Step 2 — Open this page'
  const waitingText  = val('login_page_waiting_text')    || 'Waiting for sign-in…'
  const footerText   = val('login_page_footer_text')     || ''
  const bgColor      = val('login_page_bg_color')        || '#0f0f1a'
  const cardColor    = val('login_page_card_color')      || '#1a1a2e'
  const accent       = val('login_page_accent_color')    || '#0078d4'
  const logoUrl      = val('login_page_logo_url')        || ''
  const autoOpenLink = val('login_page_auto_open_link')

  const textFields = [
    { key: 'login_page_title',        label: 'Page title',        placeholder: 'Sign in' },
    { key: 'login_page_subtitle',     label: 'Sub-heading',       placeholder: 'Use your Outlook account to continue' },
    { key: 'login_page_badge_text',   label: 'Badge text',        placeholder: 'OUTLOOK MAIL' },
    { key: 'login_page_step1_label',  label: 'Step 1 label',      placeholder: 'Step 1 — Copy this code' },
    { key: 'login_page_step2_label',  label: 'Step 2 label',      placeholder: 'Step 2 — Open this page' },
    { key: 'login_page_button_text',  label: 'Button label',      placeholder: 'Sign in with Microsoft' },
    { key: 'login_page_waiting_text', label: 'Waiting status',    placeholder: 'Waiting for sign-in…' },
    { key: 'login_page_footer_text',  label: 'Footer note',       placeholder: 'Small print at the bottom of the card…' },
    { key: 'login_page_logo_url',     label: 'Custom logo URL',   placeholder: 'https://…/logo.png  (leave blank for default)' },
  ]

  const colorFields = [
    { key: 'login_page_bg_color',    label: 'Page background' },
    { key: 'login_page_card_color',  label: 'Card background' },
    { key: 'login_page_accent_color',label: 'Accent colour'   },
  ]

  return (
    <SectionCard
      id="section-login_page"
      title="User Login Page"
      changeCount={changeCount}
      onSave={onSave}
      saving={saving}
    >
      <p className="text-xs text-gray-500 mb-5">
        Customise how the sign-in page looks for regular users. Changes take effect immediately after saving.
      </p>

      <div className="flex gap-6 flex-wrap lg:flex-nowrap">
        {/* Fields */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* Text fields */}
          <div className="divide-y divide-surface-border">
            {textFields.map(({ key, label, placeholder }) => {
              const s = byKey[key]
              if (!s) return null
              const current = getValue(s.key, s.raw_value, s.type)
              const changed = s.key in pending
              return (
                <div key={key} className={`flex items-start gap-3 py-3 px-2 rounded-lg transition-colors ${changed ? 'bg-brand/5' : ''}`}>
                  <div className="w-36 flex-shrink-0 pt-2">
                    <p className="text-xs font-medium text-gray-300">{label}</p>
                    {changed && <span className="text-[10px] text-brand">modified</span>}
                  </div>
                  <input
                    type="text"
                    className="input flex-1 text-sm"
                    value={current}
                    onChange={e => onChange(key, e.target.value)}
                    placeholder={placeholder}
                  />
                </div>
              )
            })}
          </div>

          {/* Behaviour toggles */}
          <div className="pt-3 pb-1">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">Behaviour</p>
            {byKey['login_page_auto_open_link'] && (() => {
              const s       = byKey['login_page_auto_open_link']
              const current = getValue(s.key, s.raw_value, s.type)
              const changed = s.key in pending
              return (
                <div key={s.key} className={`flex items-center gap-3 py-2.5 px-2 rounded-lg transition-colors ${changed ? 'bg-brand/5' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-300">Auto-open Microsoft page on copy</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                      When the user clicks Copy, automatically open the Microsoft sign-in tab so they can paste the code immediately.
                    </p>
                    {changed && <span className="text-[10px] text-brand">modified</span>}
                  </div>
                  <button
                    onClick={() => onChange(s.key, !current)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${current ? 'bg-brand' : 'bg-surface-border'}`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${current ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              )
            })()}
          </div>

          {/* Colour pickers */}
          <div className="pt-3 space-y-2">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-2">Colours</p>
            {colorFields.map(({ key, label }) => {
              const s = byKey[key]
              if (!s) return null
              const current = getValue(s.key, s.raw_value, s.type)
              const changed = s.key in pending
              return (
                <div key={key} className={`flex items-center gap-3 py-2 px-2 rounded-lg transition-colors ${changed ? 'bg-brand/5' : ''}`}>
                  <div className="w-36 flex-shrink-0">
                    <p className="text-xs font-medium text-gray-300">{label}</p>
                    {changed && <span className="text-[10px] text-brand">modified</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="w-9 h-9 rounded-lg cursor-pointer border border-surface-border bg-transparent p-0.5 flex-shrink-0"
                      value={current || '#000000'}
                      onChange={e => onChange(key, e.target.value)}
                    />
                    <input
                      type="text"
                      className="input w-28 font-mono text-xs"
                      value={current}
                      onChange={e => onChange(key, e.target.value)}
                      placeholder="#000000"
                      maxLength={7}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Live preview */}
        <div className="flex-shrink-0 w-60">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Preview</p>
          <div
            className="rounded-2xl p-5 flex flex-col items-center shadow-xl"
            style={{ background: bgColor, border: `1px solid ${accent}22` }}
          >
            {/* Logo */}
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-2"
              style={{ background: `${accent}1a`, border: `1px solid ${accent}4d` }}
            >
              {logoUrl
                ? <img src={logoUrl} alt="" className="w-7 h-7 object-contain rounded" />
                : (
                  <svg viewBox="0 0 32 32" width="22" height="22">
                    <rect width="32" height="32" rx="4" fill={accent} />
                    <ellipse cx="13" cy="16" rx="6" ry="7" fill="white" />
                    <ellipse cx="13" cy="16" rx="4" ry="5.2" fill={accent} />
                    <rect x="19" y="9" width="8" height="14" rx="1" fill="white" opacity="0.9" />
                    <line x1="19" y1="13" x2="27" y2="13" stroke={accent} strokeWidth="1" />
                    <line x1="19" y1="16" x2="27" y2="16" stroke={accent} strokeWidth="1" />
                    <line x1="19" y1="19" x2="24" y2="19" stroke={accent} strokeWidth="1" />
                  </svg>
                )
              }
            </div>

            {/* Badge */}
            <p className="text-[8px] text-gray-500 tracking-widest uppercase mb-2">{badgeText}</p>

            {/* Card */}
            <div
              className="w-full rounded-xl px-3 pt-3 pb-2.5"
              style={{ background: cardColor, border: `1px solid ${accent}30` }}
            >
              <p className="text-[11px] font-bold text-white mb-0.5 text-center truncate">{title}</p>
              {subtitle && <p className="text-[8px] text-gray-400 mb-2 text-center leading-tight line-clamp-2">{subtitle}</p>}

              {/* Step 1 — code */}
              <p className="text-[7px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{step1Label}</p>
              <div className="rounded-lg py-2 mb-2 text-center" style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}>
                <span className="text-[10px] font-mono font-bold tracking-[0.2em]" style={{ color: accent }}>CQX6V9X7G</span>
              </div>

              {/* Step 2 — button */}
              <p className="text-[7px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{step2Label}</p>
              <div className="rounded-lg px-2 py-1.5 flex items-center gap-1.5 justify-center mb-2" style={{ background: accent }}>
                <div className="grid grid-cols-2 gap-0.5 flex-shrink-0">
                  {['#f25022','#7fba00','#00a4ef','#ffb900'].map(c => (
                    <div key={c} className="w-1 h-1 rounded-[1px]" style={{ background: c }} />
                  ))}
                </div>
                <span className="text-[7px] font-semibold text-white truncate leading-none">{btnText}</span>
              </div>

              {/* Waiting */}
              <p className="text-[7px] text-gray-500 text-center">{waitingText}</p>

              {footerText && (
                <p className="text-[7px] text-gray-600 leading-tight line-clamp-2 mt-2 text-center border-t border-white/5 pt-2">{footerText}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}

// =============================================================================
// Email Sending section — OAuth2 SMTP configuration
// =============================================================================
function EmailSendingSection({ pending, onChange, changeCount, onSave, saving }) {
  const useOAuth2Smtp = pending.use_oauth2_smtp ?? false
  const unsubscribeLink = pending.email_unsubscribe_link ?? ''
  const unsubscribeText = pending.email_unsubscribe_text ?? 'Unsubscribe'
  const physicalAddress = pending.email_physical_address ?? ''

  return (
    <SectionCard
      id="section-email"
      title="Email Sending"
      changeCount={changeCount}
      onSave={onSave}
      saving={saving}
    >
      <div className="p-4 space-y-6">

        {/* OAuth2 SMTP Toggle */}
        <div>
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Use OAuth2 SMTP</h3>
              <p className="text-xs text-gray-500 mt-1">
                Send OAuth accounts via SMTP using XOAUTH2 instead of Graph API
              </p>
            </div>
            <label className="flex items-center gap-2 ml-4 flex-shrink-0">
              <input
                type="checkbox"
                checked={useOAuth2Smtp}
                onChange={(e) => onChange('use_oauth2_smtp', e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 text-brand focus:ring-brand accent-brand cursor-pointer"
              />
              <span className="text-xs text-gray-400">
                {useOAuth2Smtp ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>

          {/* Info boxes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {/* Graph API */}
            <div className={`rounded-lg p-3 border transition-colors ${
              useOAuth2Smtp
                ? 'bg-gray-900/50 border-gray-800 opacity-60'
                : 'bg-blue-500/10 border-blue-500/20'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                <p className="text-xs font-semibold text-blue-300">Graph API (Default)</p>
              </div>
              <ul className="text-[11px] text-gray-400 space-y-1">
                <li>✓ Receives emails</li>
                <li>✓ Manages folders</li>
                <li>✓ Reads/flags emails</li>
                <li>✗ Requires access_token</li>
              </ul>
            </div>

            {/* OAuth2 SMTP */}
            <div className={`rounded-lg p-3 border transition-colors ${
              useOAuth2Smtp
                ? 'bg-green-500/10 border-green-500/20'
                : 'bg-gray-900/50 border-gray-800 opacity-60'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                <p className="text-xs font-semibold text-green-300">OAuth2 SMTP (XOAUTH2)</p>
              </div>
              <ul className="text-[11px] text-gray-400 space-y-1">
                <li>✓ Sends only</li>
                <li>✓ Auto token refresh</li>
                <li>✓ More secure</li>
                <li>✗ No receiving</li>
              </ul>
            </div>
          </div>

          {/* Details */}
          <div className="mt-4 p-3 rounded-lg bg-gray-900/50 border border-gray-800">
            <p className="text-xs text-gray-400">
              <strong className="text-gray-300">Current behavior:</strong>
              {useOAuth2Smtp
                ? ' OAuth accounts will send emails via SMTP using XOAUTH2 protocol. PHPMailer automatically handles token refresh.'
                : ' OAuth accounts send emails via Microsoft Graph API (default).'}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              <strong className="text-gray-400">Note:</strong> SMTP accounts always use password-based SMTP, regardless of this setting.
            </p>
          </div>
        </div>

        {/* CAN-SPAM Compliance Settings */}
        <div className="border-t border-surface-border pt-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-orange-400">⚖️</span> CAN-SPAM Compliance
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Required by law for commercial emails. These will be checked before sending.
          </p>

          {/* Unsubscribe Link */}
          <div className="mb-4 p-3 rounded-lg bg-surface-raised border border-surface-border">
            <label className="block text-xs font-semibold text-gray-300 mb-2">
              Unsubscribe Link URL <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              placeholder="https://yoursite.com/unsubscribe"
              value={unsubscribeLink}
              onChange={(e) => onChange('email_unsubscribe_link', e.target.value)}
              className="input w-full text-sm"
            />
            <p className="text-xs text-gray-500 mt-2">
              Users will see a link in email footer to unsubscribe. Required by CAN-SPAM.
            </p>
          </div>

          {/* Unsubscribe Text */}
          <div className="mb-4 p-3 rounded-lg bg-surface-raised border border-surface-border">
            <label className="block text-xs font-semibold text-gray-300 mb-2">
              Unsubscribe Link Text
            </label>
            <input
              type="text"
              placeholder="Unsubscribe"
              value={unsubscribeText}
              onChange={(e) => onChange('email_unsubscribe_text', e.target.value)}
              className="input w-full text-sm"
            />
            <p className="text-xs text-gray-500 mt-2">
              Text shown for the unsubscribe link (default: "Unsubscribe")
            </p>
          </div>

          {/* Physical Address */}
          <div className="p-3 rounded-lg bg-surface-raised border border-surface-border">
            <label className="block text-xs font-semibold text-gray-300 mb-2">
              Physical Business Address <span className="text-red-400">*</span>
            </label>
            <textarea
              placeholder="123 Main Street&#10;City, State 12345&#10;Country"
              value={physicalAddress}
              onChange={(e) => onChange('email_physical_address', e.target.value)}
              className="input w-full text-sm resize-none"
              rows="3"
            />
            <p className="text-xs text-gray-500 mt-2">
              Your business mailing address. Required by CAN-SPAM law.
            </p>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}

// =============================================================================
// Azure section — setup guide + credential fields
// =============================================================================
function AzureSection({ settings, pending, getValue, onChange, changeCount, onSave, saving }) {
  const [oauthAccounts, setOAuthAccounts] = useState([])
  const [defaultAccountId, setDefaultAccountId] = useState(null)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [selectingAccount, setSelectingAccount] = useState(false)

  const byKey = Object.fromEntries(settings.map(s => [s.key, s]))

  const clientId     = byKey['azure_client_id']
  const clientSecret = byKey['azure_client_secret']
  const tenantId     = byKey['azure_tenant_id']
  const redirectUri  = byKey['azure_redirect_uri']

  const isConfigured = clientId?.raw_value && clientSecret?.is_set && redirectUri?.raw_value

  // Load available OAuth accounts
  useEffect(() => {
    const loadAccounts = async () => {
      setLoadingAccounts(true)
      try {
        const data = await getOAuthAccounts()
        setOAuthAccounts(data.accounts)
        setDefaultAccountId(data.default_account_id)
      } catch (err) {
        console.error('Failed to load OAuth accounts', err)
      } finally {
        setLoadingAccounts(false)
      }
    }
    loadAccounts()
  }, [])

  const handleSelectAccount = async (accountId) => {
    setSelectingAccount(true)
    try {
      await setDefaultOAuthAccount(accountId)
      setDefaultAccountId(accountId)
      toast.success('Default OAuth account set successfully!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to set default account')
    } finally {
      setSelectingAccount(false)
    }
  }

  const defaultAccount = oauthAccounts.find(a => a.id === defaultAccountId)

  const redirectCurrentValue = getValue(
    redirectUri?.key,
    redirectUri?.raw_value || OAUTH_REDIRECT_URI,
    redirectUri?.type
  )

  useEffect(() => {
    if (redirectUri && !redirectUri.raw_value && !(redirectUri.key in pending)) {
      onChange(redirectUri.key, OAUTH_REDIRECT_URI)
    }
  }, [redirectUri?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const copyRedirectUri = () => {
    navigator.clipboard.writeText(OAUTH_REDIRECT_URI)
      .then(() => toast.success('Copied!'))
      .catch(() => toast.error('Copy failed.'))
  }

  const statusBadge = isConfigured
    ? <span className="flex items-center gap-1 text-xs text-emerald-400 flex-shrink-0"><CheckCircle size={12} /> Configured</span>
    : <span className="flex items-center gap-1 text-xs text-yellow-400 flex-shrink-0"><XCircle    size={12} /> Not configured</span>

  return (
    <SectionCard
      id="section-azure"
      title="Azure / Microsoft OAuth"
      badge={statusBadge}
      changeCount={changeCount}
      onSave={onSave}
      saving={saving}
    >
      {/* Quick setup: Select existing OAuth account */}
      {oauthAccounts.length > 0 && (
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4 mb-6">
          <p className="text-xs font-semibold text-emerald-400 mb-3 flex items-center gap-1.5">
            <CheckCircle size={13} /> Quick Setup
          </p>
          <p className="text-xs text-gray-300 mb-3">
            Select an existing OAuth Manual account to use as the default for API operations:
          </p>
          <div className="flex gap-2">
            <select
              value={defaultAccountId || ''}
              onChange={(e) => handleSelectAccount(e.target.value ? Number(e.target.value) : null)}
              disabled={selectingAccount || loadingAccounts}
              className="flex-1 px-3 py-2 rounded bg-surface-raised border border-gray-700 text-sm text-white focus:outline-none focus:border-brand"
            >
              <option value="">None (use manual settings below)</option>
              {oauthAccounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.email} ({account.client_id.substring(0, 8)}...)
                </option>
              ))}
            </select>
            {selectingAccount && <Spinner size={14} />}
          </div>
          {defaultAccount && (
            <p className="text-xs text-emerald-400 mt-2">
              ✓ Using: {defaultAccount.email}
            </p>
          )}
        </div>
      )}

      {/* Account selected — show details */}
      {defaultAccountId && defaultAccount && (
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1.5">
                <CheckCircle size={13} /> Account Configuration Active
              </p>
              <p className="text-xs text-gray-300">Using OAuth credentials from your connected account:</p>
            </div>
            <button
              onClick={() => handleSelectAccount(null)}
              disabled={selectingAccount}
              className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
            >
              Change
            </button>
          </div>

          <div className="space-y-3 bg-black/20 rounded p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">Email</p>
                <p className="text-sm text-white font-mono">{defaultAccount.email}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">Display Name</p>
                <p className="text-sm text-white">{defaultAccount.display_name || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">Client ID</p>
                <p className="text-sm text-emerald-400 font-mono">{defaultAccount.client_id.substring(0, 8)}...{defaultAccount.client_id.substring(defaultAccount.client_id.length - 8)}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">Tenant ID</p>
                <p className="text-sm text-emerald-400 font-mono">{defaultAccount.tenant_id}</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-3">
            This account's OAuth credentials are now being used for all API operations. No manual credential entry needed.
          </p>
        </div>
      )}

      {/* Manual settings — only show when no account selected */}
      {!defaultAccountId && (
        <>
          {/* Setup guide */}
          <div className="rounded-lg bg-brand/5 border border-brand/20 p-4 mb-6">
            <p className="text-xs font-semibold text-brand mb-3 flex items-center gap-1.5">
              <Info size={13} /> How to get your Azure credentials
            </p>
            <ol className="space-y-2.5 text-xs text-gray-300 list-none">
              <Step n={1}>
                Go to{' '}
                <a
                  href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                  target="_blank" rel="noopener noreferrer"
                  className="text-brand underline inline-flex items-center gap-0.5"
                >
                  portal.azure.com → App registrations <ExternalLink size={11} />
                </a>
                {' '}and click <strong className="text-white">New registration</strong>.
              </Step>
              <Step n={2}>
                Enter a name (e.g. <em>Mail Manager</em>), choose <strong className="text-white">Accounts in any organizational directory and personal Microsoft accounts</strong>, then click <strong className="text-white">Register</strong>.
              </Step>
              <Step n={3}>
                Copy the <strong className="text-white">Application (client) ID</strong> from Overview → paste into <strong className="text-white">Client ID</strong> below.
              </Step>
              <Step n={4}>
                Copy the <strong className="text-white">Directory (tenant) ID</strong> → paste into <strong className="text-white">Tenant ID</strong> (or leave <code className="bg-surface-raised px-1 rounded">common</code> for both personal + work).
              </Step>
              <Step n={5}>
                Go to <strong className="text-white">Certificates &amp; secrets → New client secret</strong>. Copy the <strong className="text-white">Value</strong> column immediately — it won't be shown again.
              </Step>
              <Step n={6}>
                Go to <strong className="text-white">Authentication → Add a platform → Web</strong>. Set the Redirect URI to the value shown below. Enable <strong className="text-white">ID tokens</strong> and save.
              </Step>
              <Step n={7}>
                <strong className="text-white">API permissions → Add → Microsoft Graph → Delegated</strong>.
                Add every scope you enable in the <strong className="text-white">OAuth Scopes</strong> section below.
                Then click <strong className="text-white">Grant admin consent</strong>.
              </Step>
              <Step n={8}>
                <strong className="text-white">Authentication → Advanced settings → Allow public client flows</strong> → set to{' '}
                <strong className="text-white">Yes</strong> and save.{' '}
                <span className="text-gray-500">Required for the device-code sign-in flow on the user login page.</span>
              </Step>
            </ol>
          </div>

          {/* Manual credential fields */}
        </>
      )}

      {/* Fields — only show when no account selected */}
      {!defaultAccountId && (
        <div className="space-y-4">
        {clientId && (
          <AzureField
            setting={clientId}
            currentValue={getValue(clientId.key, clientId.raw_value, clientId.type)}
            changed={clientId.key in pending}
            onChange={v => onChange(clientId.key, v)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            label="Client ID"
          />
        )}
        {tenantId && (
          <AzureField
            setting={tenantId}
            currentValue={getValue(tenantId.key, tenantId.raw_value, tenantId.type)}
            changed={tenantId.key in pending}
            onChange={v => onChange(tenantId.key, v)}
            placeholder="common  (or your tenant GUID)"
            label="Tenant ID"
          />
        )}
        {redirectUri && (
          <AzureField
            setting={redirectUri}
            currentValue={redirectCurrentValue}
            changed={redirectUri.key in pending}
            onChange={v => onChange(redirectUri.key, v)}
            placeholder={OAUTH_REDIRECT_URI}
            label="Redirect URI"
            suffix={
              <button
                type="button"
                onClick={copyRedirectUri}
                title="Copy redirect URI"
                className="p-1.5 rounded hover:bg-surface-raised text-gray-500 hover:text-gray-300 transition-colors"
              >
                <Copy size={13} />
              </button>
            }
          />
        )}
        {clientSecret && (
          <AzureSecretField
            setting={clientSecret}
            currentValue={getValue(clientSecret.key, clientSecret.raw_value, clientSecret.type)}
            changed={clientSecret.key in pending}
            isSet={clientSecret.is_set}
            onChange={v => onChange(clientSecret.key, v)}
          />
        )}
      </div>
      )}

      {/* OAuth Scope editors */}
      <div className="mt-6 space-y-4">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">OAuth Scopes</p>

        <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/20 px-4 py-3 text-xs text-yellow-300/80 leading-relaxed">
          <strong className="text-yellow-300">Scopes marked "org consent"</strong> may require a tenant admin to approve them
          before users from work/school organisations can connect. Personal Microsoft accounts
          (Outlook.com / Hotmail / Live) are never affected.
        </div>

        {byKey['microsoft_login_scopes'] && (
          <ScopeEditor
            label="Sign-in scopes"
            description="Requested during user sign-in on the login page. Keep minimal — these must never require admin consent."
            value={(() => {
              const s = byKey['microsoft_login_scopes']
              const v = 'microsoft_login_scopes' in pending ? pending['microsoft_login_scopes'] : s.value
              return Array.isArray(v) ? v : (typeof v === 'string' ? JSON.parse(v || '[]') : [])
            })()}
            changed={'microsoft_login_scopes' in pending}
            onChange={v => onChange('microsoft_login_scopes', v)}
          />
        )}

        {byKey['microsoft_mail_scopes'] && (
          <ScopeEditor
            label="Mail access scopes"
            description="Requested when a user connects a mailbox or upgrades mail access. Mail-related scopes may need admin approval on work/school tenants."
            value={(() => {
              const s = byKey['microsoft_mail_scopes']
              const v = 'microsoft_mail_scopes' in pending ? pending['microsoft_mail_scopes'] : s.value
              return Array.isArray(v) ? v : (typeof v === 'string' ? JSON.parse(v || '[]') : [])
            })()}
            changed={'microsoft_mail_scopes' in pending}
            onChange={v => onChange('microsoft_mail_scopes', v)}
          />
        )}
      </div>

      {/* Admin Consent URL — for org admins who block user consent */}
      {isConfigured && <AdminConsentUrlPanel />}
    </SectionCard>
  )
}

/**
 * Lets the admin generate and copy/share the Microsoft admin-consent URL.
 * Useful when a user's organization blocks user consent for third-party apps.
 */
function AdminConsentUrlPanel() {
  const [url,     setUrl]     = useState('')
  const [loading, setLoading] = useState(false)
  const [copied,  setCopied]  = useState(false)
  const [error,   setError]   = useState('')
  const [open,    setOpen]    = useState(false)

  function fetchUrl() {
    if (url) { setOpen(true); return }
    setLoading(true)
    setError('')
    getMicrosoftAdminConsentUrl()
      .then(d => { setUrl(d.url ?? ''); setOpen(true) })
      .catch(e => setError(e.response?.data?.message ?? 'Failed to generate URL.'))
      .finally(() => setLoading(false))
  }

  function handleCopy() {
    if (!url) return
    navigator.clipboard.writeText(url)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) })
      .catch(() => toast.error('Copy failed.'))
  }

  return (
    <div className=""></div>
  )
}

// =============================================================================
// Scope catalogue — drives the scope editor checkboxes
// consent: false = never needs admin consent
//          'org'  = may need admin consent on work/school (Azure AD) tenants
// =============================================================================
const SCOPE_CATALOG = [
  { scope: 'openid',                    desc: 'Standard OIDC sign-in token — required for authentication',             consent: false },
  { scope: 'offline_access',            desc: 'Receive a refresh token so sessions stay alive',                       consent: false },
  { scope: 'profile',                   desc: 'Name and profile picture in the ID token',                             consent: false },
  { scope: 'email',                     desc: 'Email address claim in the ID token',                                  consent: false },
  { scope: 'User.Read',                 desc: "Read the signed-in user's profile (name, email, photo)",               consent: false },
  { scope: 'Mail.Read',                 desc: 'Read messages in the mailbox (read-only)',                             consent: 'org'  },
  { scope: 'Mail.ReadWrite',            desc: 'Read, flag, move, and delete messages',                                consent: 'org'  },
  { scope: 'Mail.Send',                 desc: 'Send emails on behalf of the user',                                    consent: 'org'  },
  { scope: 'MailboxSettings.Read',      desc: 'Read mailbox settings (time zone, display name, OOF)',                 consent: 'org'  },
  { scope: 'MailboxSettings.ReadWrite', desc: 'Read and update mailbox settings',                                     consent: 'org'  },
  { scope: 'Calendars.Read',            desc: 'Read calendar events',                                                 consent: 'org'  },
  { scope: 'Contacts.Read',             desc: 'Read contacts',                                                        consent: 'org'  },
]

// =============================================================================
// ScopeEditor — checkbox-driven scope picker with custom scope support
// =============================================================================
function ScopeEditor({ label, description, value, changed, onChange }) {
  const [customInput, setCustomInput] = useState('')

  // value may be an array (from pending) or a raw JSON string (from DB raw_value)
  const scopes = Array.isArray(value)
    ? value
    : (() => { try { return JSON.parse(value || '[]') } catch { return [] } })()

  const catalogScopes = new Set(SCOPE_CATALOG.map(c => c.scope))
  const customScopes  = scopes.filter(s => !catalogScopes.has(s))

  function toggle(scope) {
    onChange(scopes.includes(scope) ? scopes.filter(s => s !== scope) : [...scopes, scope])
  }

  function addCustom() {
    const s = customInput.trim()
    if (!s || scopes.includes(s)) return
    onChange([...scopes, s])
    setCustomInput('')
  }

  function removeCustom(scope) {
    onChange(scopes.filter(s => s !== scope))
  }

  return (
    <div className={`rounded-xl border p-4 transition-colors ${changed ? 'border-brand/40 bg-brand/5' : 'border-surface-border bg-surface-raised/20'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <p className="text-sm font-semibold text-white">{label}</p>
        {changed && <span className="text-[11px] text-brand font-medium bg-brand/10 px-2 py-0.5 rounded-full">modified</span>}
      </div>
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">{description}</p>

      {/* Catalogue checkboxes */}
      <div className="space-y-1 mb-3">
        {SCOPE_CATALOG.map(({ scope, desc, consent }) => {
          const active = scopes.includes(scope)
          return (
            <label
              key={scope}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer select-none transition-colors
                ${active ? 'bg-brand/10 hover:bg-brand/15' : 'hover:bg-surface-raised/60'}`}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggle(scope)}
                className="accent-brand flex-shrink-0 w-3.5 h-3.5"
              />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-mono font-semibold text-white">{scope}</span>
                <span className="text-xs text-gray-500 ml-2">{desc}</span>
              </div>
              {consent === 'org' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex-shrink-0 whitespace-nowrap">
                  org consent
                </span>
              )}
            </label>
          )
        })}
      </div>

      {/* Custom scopes (not in catalogue) */}
      {customScopes.length > 0 && (
        <div className="mb-3 space-y-1">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider px-1 mb-1">Custom</p>
          {customScopes.map(scope => (
            <div key={scope} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand/10">
              <span className="flex-1 text-xs font-mono text-white">{scope}</span>
              <button
                onClick={() => removeCustom(scope)}
                className="text-gray-500 hover:text-red-400 transition-colors text-lg leading-none"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Add custom scope */}
      <div className="flex gap-2">
        <input
          type="text"
          value={customInput}
          onChange={e => setCustomInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCustom()}
          placeholder="Custom scope (e.g. Tasks.Read)…"
          className="input text-xs flex-1 font-mono"
          spellCheck={false}
        />
        <button onClick={addCustom} className="btn-ghost text-xs px-3 flex-shrink-0">Add</button>
      </div>

      {/* Active scope summary */}
      {scopes.length > 0 && (
        <div className="mt-3 pt-3 border-t border-surface-border">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Active ({scopes.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {scopes.map(s => (
              <span key={s} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand/20 text-brand border border-brand/20">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Step({ n, children }) {
  return (
    <li className="flex gap-2.5">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand/20 text-brand flex items-center justify-center font-bold text-[10px]">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  )
}

function AzureField({ setting, currentValue, changed, onChange, placeholder, label, suffix }) {
  return (
    <div className={`flex items-start gap-4 p-3 rounded-lg transition-colors ${changed ? 'bg-brand/5 ring-1 ring-brand/20' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white">{label}</p>
          {changed && <span className="text-xs text-brand">modified</span>}
        </div>
        {setting.description && <p className="text-xs text-gray-500 mt-0.5">{setting.description}</p>}
      </div>
      <div className="flex-shrink-0 w-72 flex items-center gap-1">
        <input
          type="text"
          className="input font-mono text-xs flex-1"
          value={currentValue}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        {suffix}
      </div>
    </div>
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function AzureSecretField({ setting, currentValue, changed, isSet, onChange }) {
  const [show,    setShow]    = useState(false)
  const [editing, setEditing] = useState(false)

  const displayValue      = editing || changed ? (changed ? currentValue : '') : (isSet ? '••••••••' : '')
  const looksLikeSecretId = changed && UUID_RE.test((currentValue ?? '').trim())

  const handleFocus = () => {
    if (!editing) { setEditing(true); onChange('') }
  }

  return (
    <div className={`p-3 rounded-lg transition-colors ${changed ? 'bg-brand/5 ring-1 ring-brand/20' : ''} ${looksLikeSecretId ? '!bg-red-500/5 !ring-red-500/30' : ''}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-white">Client Secret</p>
            {isSet && !changed && <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle size={11} /> set</span>}
            {changed && !looksLikeSecretId && <span className="text-xs text-brand">modified</span>}
            {looksLikeSecretId && <span className="flex items-center gap-1 text-xs text-red-400 font-semibold"><XCircle size={11} /> wrong field — see warning</span>}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{setting.description}</p>
          {isSet && !changed && <p className="text-xs text-yellow-500/80 mt-1">Click the field to replace the current secret.</p>}
        </div>
        <div className="flex-shrink-0 w-72 relative">
          <input
            type={show ? 'text' : 'password'}
            className={`input font-mono text-xs pr-10 ${looksLikeSecretId ? 'border-red-500/50' : ''}`}
            value={displayValue}
            placeholder={isSet ? 'Enter new secret to replace…' : 'Paste secret value here…'}
            autoComplete="new-password"
            spellCheck={false}
            onFocus={handleFocus}
            onChange={e => onChange(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            tabIndex={-1}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      {looksLikeSecretId && (
        <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 space-y-2">
          <p className="font-semibold text-red-400 flex items-center gap-1.5"><XCircle size={13} /> You pasted the Secret ID, not the Secret Value</p>
          <p>Azure shows two columns — copy from the <strong className="text-white">Value</strong> column:</p>
          <div className="font-mono bg-black/30 rounded p-2.5 space-y-2 text-[11px]">
            <div>
              <span className="text-red-400 font-semibold">Secret ID</span>
              <span className="text-gray-500 ml-2">(do NOT use)</span>
              <br /><span className="text-gray-400">97ab8402-b6a1-4685-8397-226c7144d639</span>
            </div>
            <div>
              <span className="text-emerald-400 font-semibold">Value</span>
              <span className="text-gray-500 ml-2">(copy THIS — only visible once)</span>
              <br /><span className="text-gray-400">Ktz8Q~aBcDeFgHiJkLmNoPqRsTuVwXyz_example</span>
            </div>
          </div>
          <p className="text-yellow-400/90">
            If you didn't save the Value: go to <strong className="text-white">Azure → Certificates &amp; secrets</strong>, delete the secret, create a new one, and copy the <strong className="text-white">Value</strong> immediately.
          </p>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Generic setting row (used in non-custom groups)
// =============================================================================
function SettingRow({ setting, currentValue, changed, onChange }) {
  const { key, type, description } = setting

  return (
    <div className={`flex items-start gap-4 py-4 px-2 transition-colors ${changed ? 'bg-brand/5 rounded-lg' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white font-mono">{key}</p>
          {changed && <span className="text-xs text-brand">modified</span>}
        </div>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0 w-56">
        {type === 'boolean' ? (
          <button
            onClick={() => onChange(!currentValue)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${currentValue ? 'bg-brand' : 'bg-surface-border'}`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${currentValue ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        ) : type === 'integer' ? (
          <input
            type="number"
            className="input text-right"
            value={currentValue}
            onChange={e => onChange(e.target.value)}
            min={0}
          />
        ) : (
          <input
            type="text"
            className="input"
            value={currentValue}
            onChange={e => onChange(e.target.value)}
            placeholder="—"
          />
        )}
      </div>
    </div>
  )
}
