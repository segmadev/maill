import { useState, useEffect } from 'react'
import {
  Reply, ReplyAll, Forward, Trash2, Star, Mail,
  Paperclip, Download, ChevronDown, FolderInput,
} from 'lucide-react'
import toast from 'react-hot-toast'
import useMailStore from '../../store/mailStore'
import { deleteEmail, flagEmail, markRead, getAttachments } from '../../api/mail'
import Spinner from '../ui/Spinner'

function fmt(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function MailViewer({ onMoveClick }) {
  const { openEmail, loadingEmail, setCompose, removeEmailLocal, toggleFlagLocal, markReadLocal } = useMailStore()
  const [attachments,    setAttachments]    = useState(null)
  const [loadingAttach,  setLoadingAttach]  = useState(false)
  const [showHeaders,    setShowHeaders]    = useState(false)

  useEffect(() => {
    setAttachments(null)
    setShowHeaders(false)
    if (openEmail?.has_attachments) {
      setLoadingAttach(true)
      getAttachments(openEmail.id)
        .then(d => setAttachments(d.attachments ?? []))
        .catch(() => {})
        .finally(() => setLoadingAttach(false))
    }
  }, [openEmail?.id])

  if (!openEmail) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <div className="text-center">
          <Mail size={36} className="text-gray-700 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Select an email to read</p>
        </div>
      </div>
    )
  }

  async function handleDelete() {
    try {
      await deleteEmail(openEmail.id)
      removeEmailLocal(openEmail.id)
      toast.success('Moved to Deleted Items.')
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to delete.')
    }
  }

  async function handleFlag() {
    const nowFlagged = !openEmail.flagged
    toggleFlagLocal(openEmail.id, nowFlagged)
    try { await flagEmail(openEmail.id, nowFlagged) }
    catch { toggleFlagLocal(openEmail.id, !nowFlagged); toast.error('Failed to update flag.') }
  }

  async function handleMarkUnread() {
    markReadLocal(openEmail.id, false)
    markRead(openEmail.id, false).catch(() => {})
  }

  const body = openEmail.body

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-surface">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-surface-border flex-wrap">
        <button onClick={() => setCompose({ mode: 'reply', email: openEmail })} className="btn-ghost text-xs gap-1.5 py-1.5">
          <Reply size={13} /> Reply
        </button>
        <button onClick={() => setCompose({ mode: 'replyAll', email: openEmail })} className="btn-ghost text-xs gap-1.5 py-1.5">
          <ReplyAll size={13} /> Reply All
        </button>
        <button onClick={() => setCompose({ mode: 'forward', email: openEmail })} className="btn-ghost text-xs gap-1.5 py-1.5">
          <Forward size={13} /> Forward
        </button>

        <div className="flex-1" />

        <button onClick={handleMarkUnread} title="Mark unread" className="p-1.5 rounded-lg hover:bg-surface-raised text-gray-500 hover:text-white transition-colors">
          <Mail size={13} />
        </button>
        <button onClick={handleFlag} title={openEmail.flagged ? 'Unflag' : 'Flag'}
          className={`p-1.5 rounded-lg hover:bg-surface-raised transition-colors ${openEmail.flagged ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-400'}`}>
          <Star size={13} className={openEmail.flagged ? 'fill-yellow-400' : ''} />
        </button>
        {onMoveClick && (
          <button onClick={onMoveClick} title="Move to folder" className="p-1.5 rounded-lg hover:bg-surface-raised text-gray-500 hover:text-white transition-colors">
            <FolderInput size={13} />
          </button>
        )}
        <button onClick={handleDelete} title="Delete" className="p-1.5 rounded-lg hover:bg-surface-raised text-gray-500 hover:text-red-400 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <h1 className="text-lg font-semibold text-white mb-4 leading-tight">
            {openEmail.subject || '(No subject)'}
          </h1>

          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-brand/20 text-brand text-sm font-bold uppercase flex items-center justify-center flex-shrink-0">
              {(openEmail.sender_name || openEmail.sender_email || '?')[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-white">{openEmail.sender_name || openEmail.sender_email}</span>
                {openEmail.sender_name && <span className="text-xs text-gray-500">&lt;{openEmail.sender_email}&gt;</span>}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500">{fmt(openEmail.received_at)}</span>
                {openEmail.importance === 'high' && (
                  <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-semibold uppercase">High Priority</span>
                )}
              </div>
              <button onClick={() => setShowHeaders(!showHeaders)}
                className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-400 mt-0.5 transition-colors">
                <span>Details</span>
                <ChevronDown size={10} className={`transition-transform ${showHeaders ? 'rotate-180' : ''}`} />
              </button>
              {showHeaders && openEmail.body?.headers && (
                <div className="mt-2 text-[11px] text-gray-500 space-y-0.5 bg-surface-raised rounded-lg p-3">
                  {openEmail.body.headers.slice(0, 10).map((h, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-gray-600 flex-shrink-0">{h.name}:</span>
                      <span className="break-all">{h.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Attachments */}
          {openEmail.has_attachments && (
            <div className="mb-4 p-3 bg-surface-raised border border-surface-border rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Paperclip size={12} className="text-gray-500" />
                <span className="text-xs font-medium text-gray-400">Attachments</span>
              </div>
              {loadingAttach ? <Spinner size={16} /> : (
                <div className="flex flex-wrap gap-2">
                  {(attachments ?? []).filter(a => !a.isInline).map(att => (
                    <div key={att.id} className="flex items-center gap-2 bg-surface border border-surface-border rounded-lg px-3 py-2">
                      <Paperclip size={11} className="text-gray-500" />
                      <div>
                        <p className="text-xs text-gray-300 font-medium">{att.name}</p>
                        <p className="text-[10px] text-gray-600">{(att.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                  ))}
                  {attachments?.length === 0 && <p className="text-xs text-gray-600">No downloadable attachments.</p>}
                </div>
              )}
            </div>
          )}

          {/* Body */}
          {loadingEmail ? (
            <div className="flex justify-center py-12"><Spinner size={24} /></div>
          ) : body?.body_html ? (
            <div className="rounded-xl overflow-hidden border border-surface-border shadow-inner">
              {/* Render HTML emails on white — they are authored for light backgrounds.
                  Forcing a dark background causes white/light text in the original email
                  to become invisible. We isolate the light viewport inside the dark UI. */}
              <iframe
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#111111;background:#ffffff;margin:0;padding:16px}a{color:#0078d4}img{max-width:100%;height:auto}table{max-width:100%;border-collapse:collapse}pre,code{white-space:pre-wrap;word-break:break-word}</style></head><body>${body.body_html}</body></html>`}
                className="w-full min-h-96"
                style={{ border: 'none', background: '#ffffff', display: 'block' }}
                onLoad={e => {
                  const doc = e.target.contentDocument
                  if (doc) e.target.style.height = doc.documentElement.scrollHeight + 'px'
                }}
                sandbox="allow-same-origin"
                title="Email body"
              />
            </div>
          ) : body?.body_text ? (
            <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
              {body.body_text}
            </pre>
          ) : (
            <p className="text-sm text-gray-600 italic">No content to display.</p>
          )}
        </div>
      </div>
    </div>
  )
}
