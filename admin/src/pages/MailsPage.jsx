import { useEffect, useState, useCallback } from 'react'
import { Search, Eye, Trash2, Paperclip } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/layout/AdminLayout'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import Pagination from '../components/ui/Pagination'
import { getMails, getMail, deleteMail } from '../api/admin'
import { getKeywords } from '../api/mail'
import { colorConfig } from '../components/mail/KeywordManager'

function matchKeywords(email, keywords) {
  if (!keywords.length) return []
  const haystack = `${email.subject ?? ''} ${email.body_preview ?? ''}`.toLowerCase()
  return keywords.filter(kw => haystack.includes(kw.keyword.toLowerCase()))
}

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function MailsPage() {
  const [emails, setEmails]       = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)

  const [viewModal, setViewModal]     = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [keywords, setKeywords]       = useState([])

  const perPage = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getMails({ search, page, per_page: perPage })
      setEmails(data.emails)
      setTotal(data.total)
    } catch {
      toast.error('Failed to load emails.')
    } finally {
      setLoading(false)
    }
  }, [search, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search])
  useEffect(() => {
    getKeywords().then(d => setKeywords(d.keywords ?? [])).catch(() => {})
  }, [])

  const openView = async (id) => {
    setViewLoading(true)
    setViewModal({ loading: true })
    try {
      const data = await getMail(id)
      setViewModal(data.email)
    } catch {
      toast.error('Could not load email body.')
      setViewModal(null)
    } finally {
      setViewLoading(false)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteMail(deleteModal)
      toast.success('Email removed from cache.')
      setDeleteModal(null)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed.')
    }
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <AdminLayout title="Email Cache">
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input pl-8"
            placeholder="Search subject, sender, preview…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <p className="text-sm text-gray-500 ml-auto">{total} cached emails</p>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                {['Subject', 'From', 'Account', 'User', 'Folder', 'Received', ''].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {loading ? (
                <tr><td colSpan={7} className="py-16 text-center"><Spinner size={28} /></td></tr>
              ) : emails.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center text-gray-600">No emails cached yet.</td></tr>
              ) : emails.map((e) => {
                const matchedKws = matchKeywords(e, keywords)
                return (
                <tr key={e.id} className="table-row-hover">
                  <td className="px-4 py-3" style={{ maxWidth: 260 }}>
                    <div className="flex items-center gap-2">
                      {!e.is_read && <div className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />}
                      {e.has_attachments && <Paperclip size={12} className="text-gray-500 flex-shrink-0" />}
                      <p className={`truncate ${e.is_read ? 'text-gray-300' : 'text-white font-medium'}`}>
                        {e.subject || '(No subject)'}
                      </p>
                    </div>
                    {e.body_preview && <p className="text-xs text-gray-600 truncate mt-0.5">{e.body_preview}</p>}
                    {matchedKws.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-1">
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
                  </td>
                  <td className="px-4 py-3" style={{ maxWidth: 160 }}>
                    <p className="text-white text-xs truncate">{e.sender_name}</p>
                    <p className="text-gray-500 text-xs truncate">{e.sender_email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-[140px] truncate">{e.account_email}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{e.user_name}</td>
                  <td className="px-4 py-3">
                    <Badge color="gray">{e.folder_name ?? '—'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmt(e.received_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-0.5">
                      <button onClick={() => openView(e.id)} title="View"
                        className="p-1.5 rounded hover:bg-surface text-gray-500 hover:text-blue-400 transition-colors">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => setDeleteModal(e.id)} title="Remove"
                        className="p-1.5 rounded hover:bg-surface text-gray-500 hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )})}

            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={totalPages} total={total} label="cached emails" onPage={setPage} />
      </div>

      {/* View modal */}
      <Modal open={!!viewModal} onClose={() => setViewModal(null)} title="Email Preview" size="xl">
        {viewModal && !viewLoading && (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-lg font-semibold text-white">{viewModal.subject || '(No subject)'}</p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
                <span><span className="text-gray-600">From:</span> {viewModal.sender_name} &lt;{viewModal.sender_email}&gt;</span>
                <span><span className="text-gray-600">Account:</span> {viewModal.account_email}</span>
                <span><span className="text-gray-600">User:</span> {viewModal.user_name}</span>
                <span><span className="text-gray-600">Received:</span> {fmt(viewModal.received_at)}</span>
              </div>
              <div className="flex gap-1.5 pt-1">
                {!viewModal.is_read && <Badge color="blue">Unread</Badge>}
                {viewModal.has_attachments && <Badge color="gray">Has attachments</Badge>}
                {viewModal.importance !== 'normal' && <Badge color={viewModal.importance === 'high' ? 'red' : 'gray'}>{viewModal.importance}</Badge>}
              </div>
            </div>
            <div className="border-t border-surface-border pt-4">
              {viewModal.body?.body_html ? (
                <iframe
                  srcDoc={`<html><head><meta charset="utf-8"><style>body{font-family:sans-serif;font-size:14px;color:#d1d5db;background:#1e1e2e;padding:12px;margin:0}</style></head><body>${viewModal.body.body_html}</body></html>`}
                  className="w-full rounded-lg border border-surface-border"
                  style={{ height: 320 }}
                  sandbox="allow-same-origin"
                  title="Email body"
                />
              ) : viewModal.body?.body_text ? (
                <pre className="text-sm text-gray-300 whitespace-pre-wrap bg-surface rounded-lg p-4 max-h-72 overflow-y-auto">
                  {viewModal.body.body_text}
                </pre>
              ) : (
                <p className="text-sm text-gray-600">Body not cached. The user must open this email first.</p>
              )}
            </div>
          </div>
        )}
        {viewLoading && <div className="flex justify-center py-10"><Spinner size={28} /></div>}
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Remove Email" size="sm">
        <p className="text-sm text-gray-300 mb-5">
          This removes the email from the local cache and database. The email still exists in the user's Microsoft mailbox — this only clears the local record.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDeleteModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleDelete} className="btn-danger">Remove</button>
        </div>
      </Modal>
    </AdminLayout>
  )
}
