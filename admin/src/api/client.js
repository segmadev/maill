import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// Read API_BASE from environment, fallback to localhost for development
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8765/api'

// The redirect URI that must be registered in Azure App Registration.
// Derived from the API base so it never gets out of sync.
export const OAUTH_REDIRECT_URI = API_BASE + '/auth/microsoft/callback'

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,   // required so the session cookie is kept across the OAuth flow
})

// Attach JWT on every request
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle authentication errors
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const code = err.response?.data?.error ?? ''

      // Graph API errors should NOT trigger logout
      // (admin session is valid, only connected account needs re-auth)
      if (code === 'graph_error') {
        return Promise.reject(err)
      }

      // requires_reauth: BFF session expired or invalid, need to re-authenticate
      if (code === 'requires_reauth') {
        useAuthStore.getState().logout()
        window.location.href = '/login?error=session_expired'
        return Promise.reject(err)
      }

      // Any other 401: invalid/expired JWT or session
      const { user } = useAuthStore.getState()
      useAuthStore.getState().logout()
      window.location.href = user?.is_admin ? '/login' : '/user/login'
    }
    return Promise.reject(err)
  }
)

export default client
