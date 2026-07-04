/**
 * BulkImportStep
 *
 * Handles recipient import for the bulk-send wizard.
 * Supports:
 *   • Plain email lists (CSV / TXT / paste)
 *   • Structured JSON — any shape: array of objects OR object-of-objects
 *   • Auto-detection of base64-encoded email fields
 *   • Field-picker UI so admin chooses which key carries the email address
 *   • Emits recipients: Array<{ email: string, data: Record<string, any> }>
 */
import { useState, useRef } from 'react'
import { Upload, X, Users, AlertTriangle, ChevronDown, CheckCircle2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { EMAIL_RE, tryDecodeBase64Email } from '../../utils/templateUtils'

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractEmails(text) {
  return [...new Set((text.match(new RegExp(EMAIL_RE.source, 'g')) || []))]
}

function isValidEmail(str) {
  return EMAIL_RE.test(String(str ?? '').trim())
}

/** Decode a field value to an email string, trying base64 first, then direct. */
function decodeEmail(val, isBase64Field) {
  const s = String(val ?? '').trim()
  if (isBase64Field) return tryDecodeBase64Email(s) ?? s
  return s
}

/** Parse raw text into structured rows or plain email array. */
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

/** Detect which field is most likely the email field. */
function detectEmailField(rows) {
  if (!rows.length) return ''
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))]

  const EMAIL_HINTS = ['email', 'mail', 'address', 'e-mail', 'to', 'recipient', 'email_address']

  // Exact name match
  for (const hint of EMAIL_HINTS) {
    const found = keys.find(k => k.toLowerCase() === hint)
    if (found) return found
  }

  // Partial name match
  for (const hint of EMAIL_HINTS) {
    const found = keys.find(k => k.toLowerCase().includes(hint))
    if (found) return found
  }

  // Base64-encoded email values
  for (const key of keys) {
    const sample = rows.find(r => r[key])
    if (sample && tryDecodeBase64Email(String(sample[key] ?? ''))) return key
  }

  // Direct email values
  for (const key of keys) {
    const sample = rows.find(r => r[key])
    if (sample && isValidEmail(String(sample[key] ?? ''))) return key
  }

  return keys[0] ?? ''
}

/** Detect which fields have base64-encoded email values. */
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

// ── FieldSelector ─────────────────────────────────────────────────────────────
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

// ── PreviewTable ──────────────────────────────────────────────────────────────
const MAX_PREVIEW = 4
const MAX_COLS    = 5

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

// ── Main component ────────────────────────────────────────────────────────────
export default function BulkImportStep({ onComplete }) {
  const fileRef = useRef(null)

  // Structured import state
  const [rows,        setRows]        = useState([])
  const [allKeys,     setAllKeys]     = useState([])
  const [base64Fields,setBase64Fields]= useState(new Set())
  const [emailField,  setEmailField]  = useState('')
  const [isStructured,setIsStructured]= useState(false)

  // Plain import state
  const [plainEmails, setPlainEmails] = useState([])

  // Paste / input state
  const [pasteText, setPasteText] = useState('')
  const [dragOver,  setDragOver]  = useState(false)

  // ── Process parsed result ─────────────────────────────────────────────────
  function applyParsed(result) {
    if (!result) { toast.error('No valid emails or JSON data found.'); return }

    if (result.type === 'structured') {
      const keys     = [...new Set(result.rows.flatMap(r => Object.keys(r)))]
      const b64      = detectBase64Fields(result.rows, keys)
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
    setRows([]); setPlainEmails([]); setIsStructured(false)
    setAllKeys([]); setBase64Fields(new Set()); setEmailField('')
    setPasteText('')
  }

  // ── Compute recipients ────────────────────────────────────────────────────
  const isBase64EmailField = base64Fields.has(emailField)

  const structuredRecipients = rows
    .map(row => {
      const email = decodeEmail(row[emailField], isBase64EmailField)
      return { email, data: row }
    })
    .filter(r => isValidEmail(r.email))

  const plainRecipients = plainEmails.map(email => ({ email, data: {} }))

  const recipients = isStructured ? structuredRecipients : plainRecipients
  const uniqueEmails = [...new Set(recipients.map(r => r.email))]

  // ── Continue handler ──────────────────────────────────────────────────────
  function handleContinue() {
    if (!recipients.length) { toast.error('No valid email addresses found.'); return }
    // Deduplicate by email, keep first occurrence (preserves associated data)
    const seen = new Set()
    const deduped = recipients.filter(r => {
      if (seen.has(r.email)) return false
      seen.add(r.email); return true
    })
    onComplete({
      recipients: deduped,
      base64Fields: [...base64Fields],   // pass detected b64 fields to compose step
    })
  }

  const hasData = recipients.length > 0

  return (
    <div className="space-y-4">

      {/* ── Upload zone ── */}
      {!hasData ? (
        <>
          <label
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
            className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${
              dragOver ? 'border-brand bg-brand/5' : 'border-surface-border hover:border-brand/50'
            }`}
          >
            <Upload size={22} className="text-gray-500" />
            <span className="text-sm text-gray-400 font-medium">Drop file here or click to browse</span>
            <span className="text-[11px] text-gray-600">Supports CSV, TXT, and JSON — emails will be extracted automatically</span>
            <input ref={fileRef} type="file" accept=".csv,.txt,.json" className="hidden"
              onChange={e => handleFile(e.target.files?.[0])} />
          </label>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-surface-border" />
            <span className="text-xs text-gray-600">or paste text / JSON</span>
            <div className="flex-1 h-px bg-surface-border" />
          </div>

          <div>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder={'Paste email addresses, CSV rows, or raw JSON here…\n\nExamples:\n  • user@example.com, other@example.com\n  • {"0":{"value":"dXNlckBleC5jb20=","code":1234},"1":{…}}'}
              rows={6}
              className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand resize-none font-mono"
            />
            <button
              onClick={handlePaste}
              disabled={!pasteText.trim()}
              className="btn-primary text-xs mt-2"
            >
              Import &amp; Detect
            </button>
          </div>
        </>
      ) : (
        /* ── Data loaded ── */
        <div className="space-y-3">

          {/* Header bar */}
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
            <button onClick={handleReset} className="flex items-center gap-1 text-xs text-gray-500 hover:text-white">
              <RefreshCw size={11} /> Reset
            </button>
          </div>

          {/* Structured: field mapping + preview */}
          {isStructured && (
            <>
              {/* Email field selector */}
              <div className="flex items-center gap-3 p-3 bg-surface rounded-xl border border-surface-border">
                <div className="flex-1 space-y-0.5">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider">Email field</p>
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
                {isBase64EmailField && (
                  <span className="text-[10px] text-yellow-400/80 flex items-center gap-1 flex-shrink-0">
                    <AlertTriangle size={10} /> base64 → auto-decoded
                  </span>
                )}
              </div>

              {/* Preview table */}
              <div>
                <p className="text-[11px] text-gray-500 mb-1.5">Data preview (first {Math.min(MAX_PREVIEW, rows.length)} of {rows.length} rows)</p>
                <PreviewTable
                  rows={rows}
                  emailField={emailField}
                  base64Fields={base64Fields}
                  allKeys={allKeys}
                />
              </div>

              {/* Variable summary */}
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[11px] text-gray-600 flex-shrink-0 self-center">Available variables:</span>
                {allKeys.filter(k => k !== emailField).map(k => (
                  <span key={k} className="text-[10px] bg-brand/10 text-brand/80 border border-brand/20 rounded px-1.5 py-0.5 font-mono">
                    {`{{${k}}}`}
                  </span>
                ))}
              </div>
            </>
          )}

          {/* Plain: pill list */}
          {!isStructured && (
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-surface rounded-xl border border-surface-border">
              {plainEmails.map(email => (
                <span key={email} className="flex items-center gap-1 bg-surface-border text-gray-300 text-xs rounded-full px-2 py-0.5">
                  {email}
                  <button
                    onClick={() => setPlainEmails(p => p.filter(e => e !== email))}
                    className="text-gray-600 hover:text-white ml-0.5"
                  >
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Validation warning */}
          {isStructured && structuredRecipients.length < rows.length && (
            <div className="flex items-center gap-2 text-xs text-yellow-400/80 bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2">
              <AlertTriangle size={12} />
              {rows.length - structuredRecipients.length} row{rows.length - structuredRecipients.length !== 1 ? 's' : ''} skipped — email field is empty or invalid.
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-gray-600">
          {hasData && (
            <span className="flex items-center gap-1">
              <Users size={11} />
              <strong className="text-white">{uniqueEmails.length}</strong> unique recipient{uniqueEmails.length !== 1 ? 's' : ''} ready
            </span>
          )}
        </div>
        <button
          onClick={handleContinue}
          disabled={!hasData}
          className="btn-primary gap-2 text-xs"
        >
          Next: Compose →
        </button>
      </div>
    </div>
  )
}
