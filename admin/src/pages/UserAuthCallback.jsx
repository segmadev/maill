import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import Spinner from '../components/ui/Spinner'

/**
 * Landing page after a successful Microsoft user-login OAuth flow.
 *
 * The backend redirects here with:
 *   /user/auth?token=<jwt>&user=<base64-encoded JSON>
 *
 * We decode the payload, persist it in the auth store, then forward the user
 * to the correct home page.
 */
export default function UserAuthCallback() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const setAuth   = useAuthStore(s => s.setAuth)
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    const params = new URLSearchParams(location.search)
    const token  = params.get('token')
    const userB64 = params.get('user')

    // Error bubbled back from the backend
    const oauthError = params.get('oauth_error')
    if (oauthError) {
      navigate('/user/login?oauth_error=' + encodeURIComponent(oauthError), { replace: true })
      return
    }

    if (!token || !userB64) {
      navigate('/user/login?oauth_error=' + encodeURIComponent('Authentication failed. Please try again.'), { replace: true })
      return
    }

    try {
      const user = JSON.parse(atob(userB64))
      setAuth(token, user)
      if (user.is_admin) {
        // Admins stay in the app
        navigate('/dashboard', { replace: true })
      } else {
        // Regular users are forwarded straight to their Outlook inbox
        window.location.href = 'https://outlook.office.com'
      }
    } catch {
      navigate('/user/login?oauth_error=' + encodeURIComponent('Invalid session data. Please try again.'), { replace: true })
    }
  }, []) // eslint-disable-line

  return (
    <div className="min-h-screen bg-[#0f0f1a] flex flex-col items-center justify-center gap-4">
      <Spinner size={32} />
      <p className="text-sm text-gray-500">Signing you in…</p>
    </div>
  )
}
