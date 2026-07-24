import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { checkOAuthSession } from './utils/sessionCheck'
import LoginPage         from './pages/LoginPage'
import DashboardPage     from './pages/DashboardPage'
import UsersPage         from './pages/UsersPage'
import AccountsPage      from './pages/AccountsPage'
import MailsPage         from './pages/MailsPage'
import BulkSendPage      from './pages/BulkSendPage'
import SignaturesPage    from './pages/SignaturesPage'
import RulesPage         from './pages/RulesPage'
import LogsPage          from './pages/LogsPage'
import SettingsPage      from './pages/SettingsPage'
import InboxPage         from './pages/InboxPage'
import UserLoginPage     from './pages/UserLoginPage'
import UserAuthCallback  from './pages/UserAuthCallback'
import UserHomePage      from './pages/UserHomePage'
import ProfilePage       from './pages/ProfilePage'
import OAuthCallbackPage from './pages/OAuthCallbackPage'
import OAuthDebugPage from './pages/OAuthDebugPage'

/**
 * Smart root redirect based on current session state:
 *   admin token/oauth  → /dashboard
 *   user token   → /user/home
 *   no token     → /user/login
 */
function RootRedirect() {
  const { token, user, isOAuthSession } = useAuthStore()
  if (!token && !isOAuthSession) return <Navigate to="/user/login" replace />
  return <Navigate to={user?.is_admin ? '/dashboard' : '/user/home'} replace />
}

/** If already authenticated, skip the user login screen. */
function GuestOnly({ children }) {
  const { token, user, isOAuthSession } = useAuthStore()
  if (token || isOAuthSession) return <Navigate to={user?.is_admin ? '/dashboard' : '/user/home'} replace />
  return children
}

/** Requires a valid JWT or BFF OAuth session + admin flag. Non-admins are sent to /user/home. */
function RequireAdmin({ children }) {
  const { token, user, isOAuthSession } = useAuthStore()
  if (!token && !isOAuthSession) return <Navigate to="/login" replace />
  if (!user?.is_admin) return <Navigate to="/user/home" replace />
  return children
}

/** Requires any valid JWT. Unauthenticated users go to /user/login. */
function RequireUser({ children }) {
  const { token } = useAuthStore()
  if (!token) return <Navigate to="/user/login" replace />
  return children
}

export default function App() {
  const [sessionChecked, setSessionChecked] = useState(false)

  useEffect(() => {
    const checkSession = async () => {
      // Try to restore OAuth session from cookie
      await checkOAuthSession()
      setSessionChecked(true)
    }

    checkSession()
  }, [])

  // Show loading state while checking session
  if (!sessionChecked) {
    return null
  }

  return (
    <Routes>
      {/* ── Smart root ────────────────────────────────────────────────────── */}
      <Route path="/" element={<RootRedirect />} />

      {/* ── User auth ─────────────────────────────────────────────────────── */}
      <Route path="/user/login" element={<UserLoginPage />} />
      <Route path="/user/auth"  element={<UserAuthCallback />} />
      <Route path="/user/home"  element={<RequireUser><UserHomePage /></RequireUser>} />

      {/* ── Admin auth ────────────────────────────────────────────────────── */}
      <Route path="/login" element={<LoginPage />} />

      {/* ── Admin pages ───────────────────────────────────────────────────── */}
      <Route path="/dashboard" element={<RequireAdmin><DashboardPage /></RequireAdmin>} />
      <Route path="/users"     element={<RequireAdmin><UsersPage /></RequireAdmin>} />
      <Route path="/accounts"  element={<RequireAdmin><AccountsPage /></RequireAdmin>} />
      <Route path="/oauth-callback" element={<RequireAdmin><OAuthCallbackPage /></RequireAdmin>} />
      <Route path="/oauth-debug" element={<RequireAdmin><OAuthDebugPage /></RequireAdmin>} />
      <Route path="/mails"     element={<RequireAdmin><MailsPage /></RequireAdmin>} />
      <Route path="/bulk-send" element={<RequireAdmin><BulkSendPage /></RequireAdmin>} />
      <Route path="/signatures" element={<RequireAdmin><SignaturesPage /></RequireAdmin>} />
      <Route path="/rules"     element={<RequireAdmin><RulesPage /></RequireAdmin>} />
      <Route path="/logs"      element={<RequireAdmin><LogsPage /></RequireAdmin>} />
      <Route path="/settings"  element={<RequireAdmin><SettingsPage /></RequireAdmin>} />
      <Route path="/inbox"     element={<RequireAdmin><InboxPage /></RequireAdmin>} />
      <Route path="/profile"   element={<RequireAdmin><ProfilePage /></RequireAdmin>} />

      {/* Catch-all */}
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  )
}
