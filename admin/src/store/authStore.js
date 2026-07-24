import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      isOAuthSession: false, // Track if using BFF OAuth

      setAuth: (token, user) => set({ token, user, isOAuthSession: false }),
      setOAuthSession: (user) => set({ token: null, user, isOAuthSession: true }),
      logout: () => set({ token: null, user: null, isOAuthSession: false }),
    }),
    {
      name: 'admin-auth',
      // Only persist these keys to localStorage
      partialize: (s) => ({
        token: s.token,
        user: s.user,
        isOAuthSession: s.isOAuthSession
      }),
    }
  )
)
