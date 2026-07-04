import { useState, useRef } from 'react'
import { Upload, X, AlertTriangle, CheckCircle2, RefreshCw, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g

function extractEmails(text) {
  return [...new Set((text.match(EMAIL_RE) || []))]
}

function isValidEmail(str) {
  return EMAIL_RE.test(String(str ?? '').trim())
}

function tryDecodeBase64Email(str) {
  try {
    const decoded = atob(str)
    return isValidEmail(decoded) ? decoded : null
  } catch {
    return null
  }
}

function parseInput(text) {
  const trimmed = text.trim()

  // Try JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      let rows = Array.isArray(parsed) ? parsed : Object.values(parsed)
      rows = rows.filter(r => r && typeof r === 'object')
      if (rows.length > 0) return { type: 'structured', rows }
    } catch { /* fall through */ }
  }

  // Plain emails
  const emails = extractEmails(text)
  if (emails.length > 0) return { type: 'plain', emails }

  return null
}

function detectEmailField(rows) {
  if (!rows.length) return ''
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))]
  const EMAIL_HINTS = ['email', 'mail', 'address', 'e-mail', 'to', 'recipient', 'email_address']

  for (const hint of EMAIL_HINTS) {
    const found = keys.find(k => k.toLowerCase() === hint)
    if (found) return found
  }

  for (const hint of EMAIL_HINTS) {
    const found = keys.find(k => k.toLowerCase().includes(hint))
    if (found) return found
  }

  for (const key of keys) {
    const sample = rows.find(r => r[key])
    if (sample && tryDecodeBase64Email(String(sample[key] ?? ''))) return key
  }

  for (const key of keys) {
    const sample = rows.find(r => r[key])
    if (sample && isValidEmail(String(sample[key] ?? ''))) return key
  }

  return keys[0] ?? ''
}

function detectBase64Fields(rows, keys) {
  const b64 = new Set()
  for (const key of keys) {
    const samples = rows.slice(0, 5).map(r => r[key]).filter(Boolean)
    if (samples.length && samples.every(v => tryDecodeBase64Email(String(v)) !== null)) {
      b64.add(key)
    }
  }
  return b64
}

function FieldSelector({ keys, value, onChange, base64Fields }) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none bg-surface-raised border border-surface-border rounded-lg pl-3 pr-7 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-brand cursor-pointer"
      >
        {keys.map(k => (
          <option key={k} value={k}>
            {k}{base64Fields.has(k) ? ' (base64)' : ''}
          </option>
        ))}
      </select>
      <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
    </div>
  )
}

const MAX_PREVIEW = 5
const MAX_COLS = 5

function PreviewTable({ rows, emailField, base64Fields, allKeys }) {
  const [showAll, setShowAll] = useState(false)
  const visibleRows = showAll ? rows : rows.slice(0, MAX_PREVIEW)
  const visibleKeys = allKeys.slice(0, MAX_COLS)

  return (
    <div className="overflow-x-auto rounded-lg border border-surface-border text-[11px]">
      <table className="w-full">
        <thead>
          <tr className="bg-surface-raised border-b border-surface-border">
            {visibleKeys.map(k => (
              <th key={k} className={`px-2.5 py-1.5 text-left font-medium truncate max-w-[140px] ${
                k === emailField ? 'text-brand' : 'text-gray-500'
              }`}>
                {k}
                {k === emailField && <span className="ml-1 text-[9px] text-brand/60">(email)</span>}
                {base64Fields.has(k) && <span className="ml-1 text-[9px] text-yellow-500/60">(b64)</span>}
              </th>
            ))}
            {allKeys.length > MAX_COLS && (
              <th className="px-2.5 py-1.5 text-gray-600">+{allKeys.length - MAX_COLS} more</th>
            )}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, i) => (
            <tr key={i} className="border-b border-surface-border/50 hover:bg-surface-raised/30">
              {visibleKeys.map(k => {
                const raw = String(row[k] ?? '')
                const display = k === emailField && base64Fields.has(k)
                  ? (tryDecodeBase64Email(raw) ?? raw)
                  : raw
                return (
                  <td key={k} className={`px-2.5 py-1.5 truncate max-w-[140px] ${
                    k === emailField ? 'text-green-400 font-medium' : 'text-gray-400'
                  }`} title={display}>
                    {display.length > 28 ? display.slice(0, 28) + '…' : display}
                  </td>
                )
              })}
              {allKeys.length > MAX_COLS && <td />}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > MAX_PREVIEW && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full text-center py-1.5 text-[10px] text-gray-600 hover:text-gray-400 hover:bg-surface-raised/30 transition-colors"
        >
          + {rows.length - MAX_PREVIEW} more rows
        </button>
      )}
    </div>
  )
}

export default function CampaignImportModal({ open, onClose, onImport }) {
  const fileRef = useRef(null)
  const [rows, setRows] = useState([])
  const [allKeys, setAllKeys] = useState([])
  const [base64Fields, setBase64Fields] = useState(new Set())
  const [emailField, setEmailField] = useState('')
  const [isStructured, setIsStructured] = useState(false)
  const [plainEmails, setPlainEmails] = useState([])
  const [pasteText, setPasteText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [importing, setImporting] = useState(false)

  function applyParsed(result) {
    if (!result) {
      toast.error('No valid emails or JSON data found.')
      return
    }

    if (result.type === 'structured') {
      const keys = [...new Set(result.rows.flatMap(r => Object.keys(r)))]
      const b64 = detectBase64Fields(result.rows, keys)
      const detected = detectEmailField(result.rows)
      setRows(result.rows)
      setAllKeys(keys)
      setBase64Fields(b64)
      setEmailField(detected)
      setIsStructured(true)
      setPlainEmails([])
      toast.success(`Loaded ${result.rows.length} structured records.`)
    } else {
      setPlainEmails(result.emails)
      setIsStructured(false)
      setRows([])
      toast.success(`Found ${result.emails.length} email address${result.emails.length !== 1 ? 'es' : ''}.`)
    }
  }

  async function handleFile(file) {
    if (!file) return
    const text = await file.text()
    applyParsed(parseInput(text))
  }

  function handlePaste() {
    applyParsed(parseInput(pasteText))
  }

  function handleReset() {
    setRows([])
    setPlainEmails([])
    setIsStructured(false)
    setAllKeys([])
    setBase64Fields(new Set())
    setEmailField('')
    setPasteText('')
  }

  const isBase64EmailField = base64Fields.has(emailField)

  const structuredRecipients = rows
    .map(row => {
      const raw = String(row[emailField] ?? '').trim()
      const email = isBase64EmailField ? (tryDecodeBase64Email(raw) ?? raw) : raw
      return { email, name: '', group: '' }
    })
    .filter(r => isValidEmail(r.email))

  const plainRecipients = plainEmails.map(email => ({ email, name: '', group: '' }))

  const recipients = isStructured ? structuredRecipients : plainRecipients
  const uniqueEmails = [...new Set(recipients.map(r => r.email))]
  const hasData = recipients.length > 0

  async function handleContinue() {
    if (!recipients.length) {
      toast.error('No valid email addresses found.')
      return
    }

    const seen = new Set()
    const deduped = recipients.filter(r => {
      if (seen.has(r.email)) return false
      seen.add(r.email)
      return true
    })

    setImporting(true)
    try {
      await onImport(deduped)
      toast.success(`Imported ${deduped.length} recipients`)
      handleClose()
    } catch (err) {
      toast.error(err.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  function handleClose() {
    handleReset()
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} size="lg">
      <div>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Import Recipients</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-4">
          {!hasData ? (
            <>
              {/* Upload Zone */}
              <label
                onDragOver={e => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault()
                  setDragOver(false)
                  handleFile(e.dataTransfer.files[0])
                }}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-brand bg-brand/5'
                    : 'border-surface-border hover:border-brand/50'
                }`}
              >
                <Upload size={22} className="text-gray-500" />
                <span className="text-sm text-gray-400 font-medium">
                  Drop file here or click to browse
                </span>
                <span className="text-[11px] text-gray-600">
                  Supports CSV, TXT, and JSON — emails will be extracted automatically
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt,.json"
                  className="hidden"
                  onChange={e => handleFile(e.target.files?.[0])}
                />
              </label>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-surface-border" />
                <span className="text-xs text-gray-600">or paste text / JSON</span>
                <div className="flex-1 h-px bg-surface-border" />
              </div>

              {/* Paste Area */}
              <div>
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  placeholder={
                    'Paste email addresses, CSV rows, or raw JSON here…\n\nExamples:\n  • user@example.com, other@example.com\n  • {"email":"user@example.com","name":"John"}'
                  }
                  rows={6}
                  className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand resize-none font-mono"
                />
                <button
                  onClick={handlePaste}
                  disabled={!pasteText.trim()}
                  className="px-4 py-2 rounded bg-brand hover:bg-brand/90 text-white text-xs font-medium mt-2 disabled:opacity-50 w-full"
                >
                  Import & Detect
                </button>
              </div>
            </>
          ) : (
            /* Data Loaded */
            <div className="space-y-4">
              {/* Header Bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-green-400" />
                  <span className="text-sm font-medium text-white">
                    {isStructured ? 'Structured data loaded' : 'Email list loaded'}
                  </span>
                  <span className="text-xs text-gray-500">
                    — {recipients.length} recipient{recipients.length !== 1 ? 's' : ''}
                    {uniqueEmails.length < recipients.length && (
                      <span className="text-yellow-400/80 ml-1">
                        ({recipients.length - uniqueEmails.length} duplicates will be removed)
                      </span>
                    )}
                  </span>
                </div>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors"
                >
                  <RefreshCw size={11} /> Reset
                </button>
              </div>

              {/* Structured: Field Mapping + Preview */}
              {isStructured && (
                <>
                  <div className="flex items-center gap-3 p-3 bg-surface rounded-xl border border-surface-border">
                    <div className="flex-1 space-y-0.5">
                      <p className="text-[11px] text-gray-500 uppercase tracking-wider">
                        Email field
                      </p>
                      <p className="text-[11px] text-gray-600">
                        Which field in your data contains the email address?
                      </p>
                    </div>
                    <FieldSelector
                      keys={allKeys}
                      value={emailField}
                      onChange={setEmailField}
                      base64Fields={base64Fields}
                    />
                  </div>

                  <PreviewTable
                    rows={rows}
                    emailField={emailField}
                    base64Fields={base64Fields}
                    allKeys={allKeys}
                  />
                </>
              )}

              {/* Plain: Simple List */}
              {!isStructured && plainEmails.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {plainEmails.slice(0, 10).map(email => (
                    <div
                      key={email}
                      className="flex items-center gap-2 px-3 py-2 rounded bg-surface-raised border border-surface-border/50"
                    >
                      <CheckCircle2 size={12} className="text-green-400 flex-shrink-0" />
                      <span className="text-sm text-white truncate">{email}</span>
                    </div>
                  ))}
                  {plainEmails.length > 10 && (
                    <p className="text-xs text-gray-500 text-center py-2">
                      +{plainEmails.length - 10} more
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-surface-border">
                <button
                  onClick={handleReset}
                  className="flex-1 px-4 py-2 rounded border border-gray-700 text-white hover:bg-gray-700 transition-colors text-sm font-medium"
                >
                  Back
                </button>
                <button
                  onClick={handleContinue}
                  disabled={importing}
                  className="flex-1 px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 flex items-center justify-center gap-2 text-sm font-medium"
                >
                  {importing ? (
                    <Spinner size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  Import {recipients.length} Recipients
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
