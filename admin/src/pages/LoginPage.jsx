import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { Shield, Eye, EyeOff, Mail } from 'lucide-react'
import toast from 'react-hot-toast'
import { login } from '../api/admin'
import { useAuthStore } from '../store/authStore'
import { API_BASE } from '../api/client'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setAuth } = useAuthStore()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)

  // Check for OAuth errors in URL
  useEffect(() => {
    const error = searchParams.get('error')
    if (error === 'session_expired') {
      toast.error('Your session expired. Please log in again.')
    } else if (error) {
      toast.error(`OAuth login failed: ${error}`)
    }
  }, [searchParams])

  const handleEmailPasswordLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const data = await login(form.email, form.password)

      if (!data.user?.is_admin) {
        toast.error('This account does not have administrator access.')
        return
      }

      setAuth(data.token, data.user)
      toast.success(`Welcome back, ${data.user.name}`)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Login failed. Check your credentials.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthLogin = () => {
    setOauthLoading(true)
    // Redirect to backend OAuth flow
    window.location.href = `${API_BASE}/auth/microsoft/login`
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand flex items-center justify-center mb-4 shadow-lg shadow-brand/30">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
          <p className="text-sm text-gray-500 mt-1">Mail Manager — Administrator Access</p>
        </div>

        {/* OAuth Login */}
        <div className="card mb-4">
          <button
            onClick={handleOAuthLogin}
            disabled={oauthLoading}
            className="btn-primary w-full justify-center py-2.5 flex items-center gap-2"
          >
            <Mail size={16} />
            {oauthLoading ? 'Redirecting to Microsoft…' : 'Sign in with Microsoft'}
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-gray-700"></div>
          <span className="text-xs text-gray-500">or</span>
          <div className="flex-1 h-px bg-gray-700"></div>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleEmailPasswordLogin} className="card space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Email address</label>
            <input
              type="email"
              className="input"
              placeholder="admin@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                className="input pr-10"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-6">
          Admin accounts only.{' '}
          <Link to="/user/login" className="text-brand hover:text-brand/80 transition-colors">
            Not an admin?
          </Link>
        </p>
      </div>
    </div>
  )
}
