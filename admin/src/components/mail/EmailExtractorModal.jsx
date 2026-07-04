import { useState, useRef } from 'react'
import { Download, Mail, Search, FileText, Braces, AlignLeft, Trash2, Pencil, Check, X, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import { extractAccountEmails } from '../../api/admin'

const FORMAT_OPTIONS = [
  { value: 'csv',  label: 'CSV',  icon: FileText,  desc: 'Email, Name, Count columns' },
  { value: 'json', label: 'JSON', icon: Braces,    desc: 'Structured array' },
  { value: 'txt',  label: 'TXT',  icon: AlignLeft, desc: 'One address per line' },
]

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** A single address row — normal, edit, or delete-confirm mode */
function AddressRow({ item, index, onDelete, onEdit }) {
  const [mode,    setMode]    = useState('view')   // 'view' | 'edit' | 'confirm-del'
  const [editVal, setEditVal] = useState(item.email)
  const inputRef = useRef(null)

  function startEdit() {
    setEditVal(item.email)
    setMode('edit')
    setTimeout(() => inputRef.current?.focus(), 30)
  }

  function saveEdit() {
    const val = editVal.trim().toLowerCase()
    if (!val || val === item.email) { setMode('view'); return }
    onEdit(item.email, val)
    setMode('view')
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs group border-b border-surface-border/50 last:border-0">
      <span className="text-gray-600 w-6 text-right flex-shrink-0 font-mono text-[10px]">{index + 1}</span>

      {mode === 'edit' ? (
        <>
          <input
            ref={inputRef}
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setMode('view') }}
            className="flex-1 bg-surface border border-brand/50 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
          />
          <button onClick={saveEdit} className="p-1 rounded bg-brand/15 text-brand hover:bg-brand/25 transition-colors flex-shrink-0">
            <Check size={11} />
          </button>
          <button onClick={() => setMode('view')} className="p-1 rounded hover:bg-surface-raised text-gray-500 hover:text-white transition-colors flex-shrink-0">
            <X size={11} />
          </button>
        </>
      ) : mode === 'confirm-del' ? (
        <>
          <span className="flex-1 text-red-400 truncate line-through opacity-60">{item.email}</span>
          <span className="text-[10px] text-gray-500 flex-shrink-0">Remove?</span>
          <button onClick={() => onDelete(item.email)} className="p-1 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors flex-shrink-0">
            <Check size={11} />
          </button>
          <button onClick={() => setMode('view')} className="p-1 rounded hover:bg-surface-raised text-gray-500 hover:text-white transition-colors flex-shrink-0">
            <X size={11} />
          </button>
        </>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <p className="text-white truncate">{item.email}</p>
            {item.name && <p className="text-[10px] text-gray-500 truncate">{item.name}</p>}
          </div>
          <span className="text-[10px] text-gray-600 font-mono flex-shrink-0 mr-1">×{item.count}</span>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button onClick={startEdit} title="Edit" className="p-1 rounded hover:bg-surface-raised text-gray-600 hover:text-brand transition-colors">
              <Pencil size={10} />
            </button>
            <button onClick={() => setMode('confirm-del')} title="Delete" className="p-1 rounded hover:bg-surface-raised text-gray-600 hover:text-red-400 transition-colors">
              <Trash2 size={10} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function EmailExtractorModal({ account, open, onClose }) {
  const [loading,   setLoading]   = useState(false)
  const [addresses, setAddresses] = useState(null)   // null = not yet scanned
  const [scanMeta,  setScanMeta]  = useState(null)   // { account_email, total_scanned }
  const [format,    setFormat]    = useState('csv')
  const [filter,    setFilter]    = useState('')

  async function handleExtract() {
    setLoading(true)
    setAddresses(null)
    try {
      const data = await extractAccountEmails(account.id)
      setAddresses(data.addresses ?? [])
      setScanMeta({ account_email: data.account_email, total_scanned: data.total_scanned })
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Extraction failed.')
    } finally {
      setLoading(false)
    }
  }

  function handleDelete(email) {
    setAddresses(prev => prev.filter(a => a.email !== email))
    toast(`Removed ${email}`, { icon: '🗑️' })
  }

  function handleEdit(oldEmail, newEmail) {
    setAddresses(prev =>
      prev.map(a => a.email === oldEmail ? { ...a, email: newEmail } : a)
    )
  }

  function handleDownload() {
    if (!addresses) return
    const safe = (scanMeta?.account_email ?? 'export').replace(/[^a-z0-9@._-]/gi, '_')

    let content, filename, mime

    if (format === 'csv') {
      const rows = [['Email', 'Name', 'Count'], ...addresses.map(a => [a.email, a.name ?? '', String(a.count)])]
      content  = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n')
      filename = `emails-${safe}.csv`
      mime     = 'text/csv;charset=utf-8'
    } else if (format === 'json') {
      content  = JSON.stringify(addresses, null, 2)
      filename = `emails-${safe}.json`
      mime     = 'application/json'
    } else {
      content  = addresses.map(a => a.name ? `${a.name} <${a.email}>` : a.email).join('\r\n')
      filename = `emails-${safe}.txt`
      mime     = 'text/plain;charset=utf-8'
    }

    downloadBlob(content, filename, mime)
    toast.success(`Downloaded ${addresses.length} addresses as ${format.toUpperCase()}`)
  }

  function handleClose() {
    setAddresses(null)
    setScanMeta(null)
    setFilter('')
    setLoading(false)
    onClose()
  }

  const displayList = addresses?.filter(a =>
    !filter.trim() ||
    a.email.includes(filter.toLowerCase()) ||
    (a.name ?? '').toLowerCase().includes(filter.toLowerCase())
  ) ?? []

  return (
    <Modal open={open} onClose={handleClose} title="Extract Email Addresses" size="lg">
      <div className="space-y-4">

        {/* Account info + scan button */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface border border-surface-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#0078d4]/20 flex items-center justify-center flex-shrink-0">
              <Mail size={14} className="text-[#0078d4]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{account?.email}</p>
              <p className="text-xs text-gray-500">{account?.display_name || account?.user_name}</p>
            </div>
          </div>
          <button onClick={handleExtract} disabled={loading} className="btn-primary gap-2 text-xs flex-shrink-0 disabled:opacity-50">
            {loading ? <Spinner size={12} /> : <Search size={12} />}
            {loading ? 'Scanning…' : addresses !== null ? 'Re-scan' : 'Scan Emails'}
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-2 py-8">
            <Spinner size={28} />
            <p className="text-xs text-gray-500">Scanning all cached emails…</p>
          </div>
        )}

        {/* Empty state */}
        {!addresses && !loading && (
          <div className="text-center py-6">
            <Mail size={24} className="text-gray-700 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Click <span className="text-white">Scan Emails</span> to harvest all email addresses</p>
            <p className="text-xs text-gray-600 mt-1">Extracts addresses from sender fields and email body previews</p>
          </div>
        )}

        {/* Results */}
        {addresses && !loading && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Emails scanned',   value: scanMeta?.total_scanned?.toLocaleString() ?? '—' },
                { label: 'Addresses found',  value: addresses.length.toLocaleString() },
                { label: 'After edits',      value: displayList.length.toLocaleString() },
              ].map(s => (
                <div key={s.label} className="bg-surface border border-surface-border rounded-xl px-3 py-2.5 text-center">
                  <p className="text-lg font-bold text-white leading-none">{s.value}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Helper text */}
            <p className="text-[11px] text-gray-600 flex items-center gap-1.5">
              <Users size={11} />
              Hover a row to edit or remove it before downloading.
            </p>

            {/* Filter */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                className="input pl-8 text-xs"
                placeholder="Filter results…"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>

            {/* Address list */}
            <div className="border border-surface-border rounded-xl overflow-hidden">
              <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
                {displayList.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-6">No matches</p>
                ) : displayList.map((a, i) => (
                  <AddressRow
                    key={a.email}
                    item={a}
                    index={i}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                  />
                ))}
              </div>
            </div>

            {/* Format + Download */}
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5 flex-1">
                {FORMAT_OPTIONS.map(opt => {
                  const Icon = opt.icon
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setFormat(opt.value)}
                      title={opt.desc}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        format === opt.value
                          ? 'bg-brand/15 text-brand border-brand/30'
                          : 'text-gray-400 border-surface-border hover:bg-surface-raised hover:text-white'
                      }`}
                    >
                      <Icon size={11} />
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              <button onClick={handleDownload} disabled={addresses.length === 0} className="btn-primary gap-2 text-xs disabled:opacity-50">
                <Download size={12} />
                Download {format.toUpperCase()}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
