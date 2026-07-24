import { useAuthStore } from '../store/authStore'
import { API_BASE } from '../api/client'
import { logoutOAuth } from '../api/admin'

/**
 * Check if user has a valid BFF OAuth session
 * Called on app boot to restore session
 */
export async function checkOAuthSession() {
  try {
    const response = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include', // Send cookies
    })

    if (response.ok) {
      const data = await response.json()

      if (data.user && data.user.is_admin) {
        // Set OAuth session
        useAuthStore.setState({
          token: null,
          user: data.user,
          isOAuthSession: true,
        })
        return true
      }
    }

    return false
  } catch (error) {
    console.error('Failed to check OAuth session:', error)
    return false
  }
}

/**
 * Handle OAuth logout via API
 */
export async function performOAuthLogout() {
  try {
    await logoutOAuth()
  } catch (error) {
    console.error('Failed to logout:', error)
  } finally {
    // Clear auth state regardless
    useAuthStore.setState({ token: null, user: null, isOAuthSession: false })
  }
}

/**
 * Handle 401 errors from API
 * Returns true if re-auth was triggered
 */
export function handle401Error(errorData) {
  if (errorData.error === 'requires_reauth') {
    // User needs to re-authenticate
    useAuthStore.setState({ token: null, user: null, isOAuthSession: false })
    window.location.href = '/login?error=session_expired'
    return true
  }

  if (errorData.error === 'unauthorized') {
    // No valid session, clear auth
    useAuthStore.setState({ token: null, user: null, isOAuthSession: false })
    window.location.href = '/login'
    return true
  }

  return false
}
