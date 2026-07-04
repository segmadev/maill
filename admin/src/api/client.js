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

// Auto-logout only on genuine JWT auth failures (missing/expired/invalid token).
// Graph API errors arrive with error:'graph_error' — those must NOT trigger logout
// because the admin session is still valid; only the connected account needs re-auth.
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const code = err.response?.data?.error ?? ''
      if (code !== 'graph_error') {
        const { user } = useAuthStore.getState()
        useAuthStore.getState().logout()
        // Admins go back to the admin login page; regular users to the user login page.
        window.location.href = user?.is_admin ? '/login' : '/user/login'
      }
    }
    return Promise.reject(err)
  }
)

export default client
