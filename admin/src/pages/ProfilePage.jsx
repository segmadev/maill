import { useState } from 'react'
import { User, Lock, Eye, EyeOff, CheckCircle, Shield, Calendar, Mail } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/layout/AdminLayout'
import Spinner from '../components/ui/Spinner'
import { useAuthStore } from '../store/authStore'
import { updateProfile } from '../api/admin'

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function InputField({ label, type = 'text', value, onChange, placeholder, autoComplete, right }) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={isPassword && show ? 'text' : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full input text-sm pr-10"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
        {right && !isPassword && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{right}</div>
        )}
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { user, setAuth } = useAuthStore()

  // ── Name section ────────────────────────────────────────────────────────────
  const [name,        setName]        = useState(user?.name ?? '')
  const [savingName,  setSavingName]  = useState(false)
  const nameDirty = name.trim() && name.trim() !== user?.name

  async function handleSaveName() {
    if (!nameDirty) return
    setSavingName(true)
    try {
      const res = await updateProfile({ name: name.trim() })
      setAuth(useAuthStore.getState().token, res.user)
      toast.success('Name updated.')
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to update name.')
    } finally {
      setSavingName(false)
    }
  }

  // ── Password section ─────────────────────────────────────────────────────────
  const [currentPw,   setCurrentPw]   = useState('')
  const [newPw,       setNewPw]       = useState('')
  const [confirmPw,   setConfirmPw]   = useState('')
  const [savingPw,    setSavingPw]    = useState(false)
  const [pwSuccess,   setPwSuccess]   = useState(false)

  const pwReady = currentPw && newPw.length >= 8 && newPw === confirmPw

  async function handleChangePassword(e) {
    e.preventDefault()
    if (!pwReady) return
    if (newPw !== confirmPw) { toast.error('New passwords do not match.'); return }
    setSavingPw(true)
    setPwSuccess(false)
    try {
      await updateProfile({
        current_password:          currentPw,
        new_password:              newPw,
        new_password_confirmation: confirmPw,
      })
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      setPwSuccess(true)
      toast.success('Password changed successfully.')
    } catch (err) {
      const errors = err.response?.data?.errors
      if (errors?.current_password) {
        toast.error('Current password is incorrect.')
      } else if (errors?.new_password) {
        toast.error(errors.new_password[0])
      } else {
        toast.error(err.response?.data?.message ?? 'Failed to change password.')
      }
    } finally {
      setSavingPw(false)
    }
  }

  const initials = (user?.name ?? '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <AdminLayout title="My Profile">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* ── Identity card ── */}
        <div className="card p-6">
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-2xl bg-brand/20 text-brand text-xl font-bold flex items-center justify-center flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-white truncate">{user?.name}</h2>
              <p className="text-sm text-gray-400 truncate">{user?.email}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {user?.is_admin && (
                  <span className="flex items-center gap-1 text-[11px] bg-brand/10 text-brand rounded-full px-2 py-0.5 font-medium">
                    <Shield size={10} /> Administrator
                  </span>
                )}
                <span className="flex items-center gap-1 text-[11px] bg-green-500/10 text-green-400 rounded-full px-2 py-0.5 font-medium">
                  <CheckCircle size={10} /> Active
                </span>
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-surface-border">
            <div className="flex items-center gap-2.5">
              <Mail size={14} className="text-gray-600 flex-shrink-0" />
              <div>
                <p className="text-[11px] text-gray-600">Email</p>
                <p className="text-xs text-gray-300 truncate">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Calendar size={14} className="text-gray-600 flex-shrink-0" />
              <div>
                <p className="text-[11px] text-gray-600">Last login</p>
                <p className="text-xs text-gray-300">{fmt(user?.last_login_at)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Update name ── */}
        <div className="card p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="p-2 rounded-lg bg-brand/10 text-brand">
              <User size={15} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Display Name</h3>
              <p className="text-xs text-gray-500">How your name appears in the admin panel</p>
            </div>
          </div>

          <div className="space-y-4">
            <InputField
              label="Name"
              value={name}
              onChange={setName}
              placeholder="Your display name"
              autoComplete="name"
            />
            <div className="flex justify-end">
              <button
                onClick={handleSaveName}
                disabled={!nameDirty || savingName}
                className="btn-primary gap-2 text-xs disabled:opacity-40"
              >
                {savingName ? <Spinner size={12} /> : null}
                Save Name
              </button>
            </div>
          </div>
        </div>

        {/* ── Change password ── */}
        <div className="card p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400">
              <Lock size={15} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Change Password</h3>
              <p className="text-xs text-gray-500">Use a strong password with at least 8 characters</p>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <InputField
              label="Current password"
              type="password"
              value={currentPw}
              onChange={setCurrentPw}
              placeholder="Enter current password"
              autoComplete="current-password"
            />
            <InputField
              label="New password"
              type="password"
              value={newPw}
              onChange={v => { setNewPw(v); setPwSuccess(false) }}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
            />
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Confirm new password</label>
              <div className="relative">
                <ConfirmInput
                  value={confirmPw}
                  onChange={v => { setConfirmPw(v); setPwSuccess(false) }}
                  newPw={newPw}
                />
              </div>
            </div>

            {/* Requirements */}
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              {[
                { ok: newPw.length >= 8,          label: 'At least 8 characters' },
                { ok: newPw === confirmPw && !!newPw, label: 'Passwords match' },
              ].map(r => (
                <div key={r.label} className={`flex items-center gap-1.5 ${r.ok ? 'text-green-400' : 'text-gray-600'}`}>
                  <CheckCircle size={11} className={r.ok ? 'text-green-400' : 'text-gray-700'} />
                  {r.label}
                </div>
              ))}
            </div>

            {pwSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
                <p className="text-xs text-green-400">Password changed successfully.</p>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={!pwReady || savingPw}
                className="btn-primary gap-2 text-xs disabled:opacity-40"
              >
                {savingPw ? <Spinner size={12} /> : <Lock size={12} />}
                Change Password
              </button>
            </div>
          </form>
        </div>

      </div>
    </AdminLayout>
  )
}

/** Password confirm input with inline match indicator */
function ConfirmInput({ value, onChange, newPw }) {
  const [show, setShow] = useState(false)
  const match = value && value === newPw
  const mismatch = value && value !== newPw

  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Re-enter new password"
        autoComplete="new-password"
        className={`w-full input text-sm pr-16 ${
          mismatch ? 'border-red-500/50 focus:border-red-500' :
          match    ? 'border-green-500/50' : ''
        }`}
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
        {match    && <CheckCircle size={13} className="text-green-400" />}
        {mismatch && <span className="text-[10px] text-red-400">No match</span>}
        <button type="button" onClick={() => setShow(s => !s)} className="text-gray-500 hover:text-gray-300 transition-colors">
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  )
}
