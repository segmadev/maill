import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Tag, Loader, Pencil, Check, X, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import useMailStore from '../../store/mailStore'
import { getKeywords, addKeyword, updateKeyword, deleteKeyword } from '../../api/mail'

const COLORS = [
  { name: 'blue',   bg: 'bg-blue-500/20',   text: 'text-blue-300',   dot: 'bg-blue-400'   },
  { name: 'green',  bg: 'bg-green-500/20',  text: 'text-green-300',  dot: 'bg-green-400'  },
  { name: 'red',    bg: 'bg-red-500/20',    text: 'text-red-300',    dot: 'bg-red-400'    },
  { name: 'yellow', bg: 'bg-yellow-500/20', text: 'text-yellow-300', dot: 'bg-yellow-400' },
  { name: 'purple', bg: 'bg-purple-500/20', text: 'text-purple-300', dot: 'bg-purple-400' },
  { name: 'orange', bg: 'bg-orange-500/20', text: 'text-orange-300', dot: 'bg-orange-400' },
  { name: 'pink',   bg: 'bg-pink-500/20',   text: 'text-pink-300',   dot: 'bg-pink-400'   },
  { name: 'indigo', bg: 'bg-indigo-500/20', text: 'text-indigo-300', dot: 'bg-indigo-400' },
]

export function colorConfig(colorName) {
  return COLORS.find(c => c.name === colorName) ?? COLORS[0]
}

function ColorPicker({ value, onChange, size = 'md' }) {
  const sz = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  return (
    <div className="flex gap-1.5">
      {COLORS.map(c => (
        <button
          key={c.name}
          type="button"
          onClick={() => onChange(c.name)}
          className={`${sz} rounded-full ${c.dot} ring-offset-1 ring-offset-surface-raised transition-all ${
            value === c.name ? 'ring-2 ring-white scale-110' : 'opacity-50 hover:opacity-100'
          }`}
          title={c.name}
        />
      ))}
    </div>
  )
}

/** Inline row that's in edit mode */
function EditRow({ kw, onSave, onCancel }) {
  const [text,  setText]  = useState(kw.keyword)
  const [color, setColor] = useState(kw.color)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function save() {
    const val = text.trim().toLowerCase()
    if (!val) return
    setSaving(true)
    try {
      await onSave(kw.id, val, color)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 rounded-lg bg-surface-raised border border-brand/30">
      <input
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel() }}
        className="w-full bg-surface border border-surface-border rounded-md px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-brand"
      />
      <div className="flex items-center justify-between">
        <ColorPicker value={color} onChange={setColor} size="sm" />
        <div className="flex gap-1">
          <button onClick={onCancel} className="p-1 rounded hover:bg-surface text-gray-500 hover:text-white transition-colors">
            <X size={13} />
          </button>
          <button onClick={save} disabled={saving || !text.trim()} className="p-1 rounded bg-brand/20 text-brand hover:bg-brand/30 transition-colors disabled:opacity-50">
            {saving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Inline delete confirmation row */
function DeleteConfirm({ kw, onConfirm, onCancel, deleting }) {
  const cfg = colorConfig(kw.color)
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/25">
      <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />
      <span className={`flex-1 text-sm ${cfg.text} truncate`}>{kw.keyword}</span>
      <span className="text-xs text-gray-500">Delete?</span>
      <button onClick={onCancel} className="p-1 rounded hover:bg-surface text-gray-500 hover:text-white transition-colors">
        <X size={12} />
      </button>
      <button onClick={onConfirm} disabled={deleting} className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1">
        {deleting ? <Loader size={11} className="animate-spin" /> : null}
        Delete
      </button>
    </div>
  )
}

export default function KeywordManager({ open, onClose }) {
  const { keywords, setKeywords } = useMailStore()
  const [input,        setInput]        = useState('')
  const [color,        setColor]        = useState('blue')
  const [adding,       setAdding]       = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [editingId,    setEditingId]    = useState(null)
  const [confirmDelId, setConfirmDelId] = useState(null)
  const [deleting,     setDeleting]     = useState(null)

  useEffect(() => {
    if (open) load()
  }, [open]) // eslint-disable-line

  async function load() {
    setLoading(true)
    try {
      const data = await getKeywords()
      setKeywords(data.keywords ?? [])
    } catch {
      toast.error('Failed to load keywords.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    const items = input.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    if (!items.length) return
    setAdding(true)
    try {
      const results = await Promise.allSettled(items.map(kw => addKeyword(kw, color)))
      const added  = []
      const dupes  = []
      const failed = []

      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          added.push(r.value.keyword)
        } else {
          const status = r.reason?.response?.status
          if (status === 409 || status === 422) dupes.push(items[i])
          else failed.push(items[i])
        }
      })

      if (added.length) {
        setKeywords(
          [...keywords.filter(k => !added.find(a => a.id === k.id)), ...added]
            .sort((a, b) => a.keyword.localeCompare(b.keyword))
        )
        toast.success(added.length === 1 ? `"${added[0].keyword}" added.` : `${added.length} keywords added.`)
      }
      if (dupes.length)  toast(`Already exists: ${dupes.join(', ')}`, { icon: 'ℹ️' })
      if (failed.length) toast.error(`Failed to add: ${failed.join(', ')}`)
      setInput('')
    } finally {
      setAdding(false)
    }
  }

  async function handleUpdate(id, newKeyword, newColor) {
    try {
      const res = await updateKeyword(id, newKeyword, newColor)
      setKeywords(keywords.map(k => k.id === id ? res.keyword : k))
      setEditingId(null)
      toast.success('Label updated.')
    } catch {
      toast.error('Failed to update label.')
      throw new Error('update failed')
    }
  }

  async function handleDeleteConfirmed(kw) {
    setDeleting(kw.id)
    try {
      await deleteKeyword(kw.id)
      setKeywords(keywords.filter(k => k.id !== kw.id))
      setConfirmDelId(null)
      toast.success(`"${kw.keyword}" deleted.`)
    } catch {
      toast.error('Failed to delete label.')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Smart Labels / Keywords" size="sm">
      <p className="text-xs text-gray-500 mb-4">
        Emails whose subject or preview contains a keyword are automatically tagged in Smart Labels.
      </p>

      {/* ── Add form ── */}
      <div className="space-y-2.5 mb-5">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="invoice, urgent, complaint  (comma-separated)"
            className="flex-1 input text-sm"
          />
          <button onClick={handleAdd} disabled={adding || !input.trim()} className="btn-primary gap-1.5 text-xs flex-shrink-0">
            {adding ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
            Add
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Color:</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </div>

      {/* ── List ── */}
      {loading ? (
        <div className="flex justify-center py-6"><Loader size={18} className="animate-spin text-gray-500" /></div>
      ) : keywords.length === 0 ? (
        <div className="text-center py-6">
          <Tag size={20} className="text-gray-600 mx-auto mb-2" />
          <p className="text-xs text-gray-600">No keywords yet. Add one above.</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {keywords.map(kw => {
            const cfg = colorConfig(kw.color)

            if (editingId === kw.id) {
              return (
                <EditRow
                  key={kw.id}
                  kw={kw}
                  onSave={handleUpdate}
                  onCancel={() => setEditingId(null)}
                />
              )
            }

            if (confirmDelId === kw.id) {
              return (
                <DeleteConfirm
                  key={kw.id}
                  kw={kw}
                  deleting={deleting === kw.id}
                  onConfirm={() => handleDeleteConfirmed(kw)}
                  onCancel={() => setConfirmDelId(null)}
                />
              )
            }

            return (
              <div
                key={kw.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surface hover:bg-surface-raised transition-colors group"
              >
                <span className={`flex items-center gap-2 text-sm flex-1 min-w-0 ${cfg.text}`}>
                  <span className={`w-2 h-2 rounded-full ${cfg.dot} flex-shrink-0`} />
                  <span className="truncate">{kw.keyword}</span>
                </span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setConfirmDelId(null); setEditingId(kw.id) }}
                    title="Edit"
                    className="p-1 rounded hover:bg-surface text-gray-600 hover:text-brand transition-colors"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => { setEditingId(null); setConfirmDelId(kw.id) }}
                    title="Delete"
                    className="p-1 rounded hover:bg-surface text-gray-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
