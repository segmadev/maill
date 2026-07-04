import { useEffect, useState, useCallback } from 'react'
import { Search, Plus, Pencil, Trash2, ShieldCheck, ShieldOff, UserCheck, UserX, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/layout/AdminLayout'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import Pagination from '../components/ui/Pagination'
import {
  getUsers, createUser, updateUser, deleteUser,
  toggleUserActive, toggleUserAdmin, getUser,
} from '../api/admin'
import { useAuthStore } from '../store/authStore'

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const EMPTY_FORM = { name: '', email: '', password: '', is_admin: false }

export default function UsersPage() {
  const { user: me } = useAuthStore()

  const [users, setUsers]         = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [filter, setFilter]       = useState('all')
  const [loading, setLoading]     = useState(true)

  const [createModal, setCreateModal] = useState(false)
  const [editModal, setEditModal]     = useState(null)   // user object
  const [viewModal, setViewModal]     = useState(null)   // user detail
  const [deleteModal, setDeleteModal] = useState(null)   // user id
  const [form, setForm]               = useState(EMPTY_FORM)
  const [saving, setSaving]           = useState(false)

  const perPage = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getUsers({ search, filter, page, per_page: perPage })
      setUsers(data.users)
      setTotal(data.total)
    } catch {
      toast.error('Failed to load users.')
    } finally {
      setLoading(false)
    }
  }, [search, filter, page])

  useEffect(() => { load() }, [load])

  // Debounce search
  useEffect(() => { setPage(1) }, [search, filter])

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await createUser(form)
      toast.success('User created.')
      setCreateModal(false)
      setForm(EMPTY_FORM)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to create user.')
    } finally {
      setSaving(false)
    }
  }

  // ── Edit ────────────────────────────────────────────────────────────────────
  const openEdit = (u) => {
    setEditModal(u)
    setForm({ name: u.name, email: u.email, password: '', is_admin: u.is_admin })
  }

  const handleEdit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const payload = { name: form.name, email: form.email, is_admin: form.is_admin }
    if (form.password) payload.password = form.password
    try {
      await updateUser(editModal.id, payload)
      toast.success('User updated.')
      setEditModal(null)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to update user.')
    } finally {
      setSaving(false)
    }
  }

  // ── View detail ─────────────────────────────────────────────────────────────
  const openView = async (id) => {
    try {
      const data = await getUser(id)
      setViewModal(data)
    } catch {
      toast.error('Could not load user details.')
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      await deleteUser(deleteModal)
      toast.success('User deleted.')
      setDeleteModal(null)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to delete user.')
    }
  }

  // ── Toggle helpers ───────────────────────────────────────────────────────────
  const toggleActive = async (u) => {
    try {
      await toggleUserActive(u.id)
      toast.success(u.is_active ? 'User deactivated.' : 'User activated.')
      load()
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed.')
    }
  }

  const toggleAdmin = async (u) => {
    try {
      await toggleUserAdmin(u.id)
      toast.success(u.is_admin ? 'Admin revoked.' : 'Admin granted.')
      load()
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed.')
    }
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <AdminLayout title="User Management">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input pl-8"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-36"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All users</option>
          <option value="admin">Admins only</option>
          <option value="inactive">Inactive</option>
        </select>
        <button onClick={() => { setForm(EMPTY_FORM); setCreateModal(true) }} className="btn-primary flex-shrink-0">
          <Plus size={15} /> New User
        </button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {/* Horizontal scroll wrapper — table won't collapse below 680 px */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                {['User', 'Status', 'Accts', 'Last Login', 'Joined', 'Actions'].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {loading ? (
                <tr><td colSpan={6} className="py-16 text-center"><Spinner size={28} /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="py-16 text-center text-gray-600">No users found.</td></tr>
              ) : users.map((u) => (
                <tr key={u.id} className="table-row-hover">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand/20 text-brand text-xs font-bold uppercase flex items-center justify-center flex-shrink-0">
                        {u.name?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-white truncate max-w-[160px]">{u.name}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[160px]">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      {u.is_admin  && <Badge color="purple">Admin</Badge>}
                      <Badge color={u.is_active ? 'green' : 'red'}>
                        {u.is_active ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-center">{u.connected_accounts_count}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">{fmt(u.last_login_at)}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">{fmt(u.created_at)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => openView(u.id)} title="View" className="p-1.5 rounded hover:bg-surface text-gray-500 hover:text-blue-400 transition-colors">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => openEdit(u)} title="Edit" className="p-1.5 rounded hover:bg-surface text-gray-500 hover:text-white transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => toggleAdmin(u)} title={u.is_admin ? 'Revoke admin' : 'Grant admin'}
                        className="p-1.5 rounded hover:bg-surface text-gray-500 hover:text-purple-400 transition-colors">
                        {u.is_admin ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                      </button>
                      <button onClick={() => toggleActive(u)} title={u.is_active ? 'Disable' : 'Enable'}
                        disabled={u.id === me?.id}
                        className="p-1.5 rounded hover:bg-surface text-gray-500 hover:text-yellow-400 transition-colors disabled:opacity-30">
                        {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                      </button>
                      <button onClick={() => setDeleteModal(u.id)} title="Delete"
                        disabled={u.id === me?.id}
                        className="p-1.5 rounded hover:bg-surface text-gray-500 hover:text-red-400 transition-colors disabled:opacity-30">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={totalPages} total={total} label="users" onPage={setPage} />
      </div>

      {/* ── Create Modal ─────────────────────────────────────────────────────── */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create User">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email</label>
              <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Password</label>
            <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-brand" checked={form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} />
            <span className="text-sm text-gray-300">Grant admin access</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateModal(false)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating…' : 'Create User'}</button>
          </div>
        </form>
      </Modal>

      {/* ── Edit Modal ───────────────────────────────────────────────────────── */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title="Edit User">
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email</label>
              <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">New Password <span className="text-gray-600">(leave blank to keep current)</span></label>
            <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-brand" checked={form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} />
            <span className="text-sm text-gray-300">Admin access</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditModal(null)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>
      </Modal>

      {/* ── View Modal ───────────────────────────────────────────────────────── */}
      <Modal open={!!viewModal} onClose={() => setViewModal(null)} title="User Details" size="lg">
        {viewModal && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-brand/20 text-brand text-lg font-bold uppercase flex items-center justify-center">
                {viewModal.user?.name?.[0]}
              </div>
              <div>
                <p className="text-base font-semibold text-white">{viewModal.user?.name}</p>
                <p className="text-sm text-gray-400">{viewModal.user?.email}</p>
                <div className="flex gap-1.5 mt-1">
                  {viewModal.user?.is_admin   && <Badge color="purple">Admin</Badge>}
                  <Badge color={viewModal.user?.is_active ? 'green' : 'red'}>
                    {viewModal.user?.is_active ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="card py-3"><p className="text-xs text-gray-500">Joined</p><p className="text-white mt-0.5">{fmt(viewModal.user?.created_at)}</p></div>
              <div className="card py-3"><p className="text-xs text-gray-500">Last Login</p><p className="text-white mt-0.5">{fmt(viewModal.user?.last_login_at)}</p></div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Connected Accounts ({viewModal.accounts?.length ?? 0})
              </p>
              {viewModal.accounts?.length === 0 && <p className="text-sm text-gray-600">None connected yet.</p>}
              <div className="space-y-2">
                {viewModal.accounts?.map((a) => (
                  <div key={a.id} className="flex items-center justify-between bg-surface rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm text-white">{a.email}</p>
                      <p className="text-xs text-gray-500">{a.display_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.is_primary && <Badge color="blue">Primary</Badge>}
                      <p className="text-xs text-gray-600">Added {fmt(a.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Delete User" size="sm">
        <p className="text-sm text-gray-300 mb-5">
          This will permanently delete the user and all their connected accounts and cached emails. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDeleteModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleDelete} className="btn-danger">Delete User</button>
        </div>
      </Modal>
    </AdminLayout>
  )
}
