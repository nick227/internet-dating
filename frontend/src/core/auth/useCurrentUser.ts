import { useCallback, useEffect } from 'react'
import { api } from '../../api/client'
import { useAsync } from '../hooks/useAsync'
import { useAuth } from './useAuth'

const DEBUG = Boolean(import.meta.env?.DEV)

/**
 * Hook for current user with profile data.
 * Use useAuth() for simple auth state checks.
 * Use this hook when you need profile information (name, avatar, etc.).
 */
export function useCurrentUser() {
  const auth = useAuth()
  const userId = auth.userId

  // Stabilize the async function with useCallback to prevent infinite loops
  const fetchProfile = useCallback(
    async (signal: AbortSignal) => {
      if (!userId) return null
      try {
        return await api.profile(userId, signal)
      } catch {
        return null
      }
    },
    [userId]
  )

  // Use userId directly - useAsync handles dependency comparison internally
  const { data: profile, error, loading: profileLoading } = useAsync(fetchProfile, [userId])

  useEffect(() => {
    if (!DEBUG) return
    console.debug('[auth] currentUser', { userId: userId ?? null, authLoading: auth.loading })
  }, [auth.loading, userId])

  const displayName = profile?.name ? profile.name : userId ? `User ${userId}` : null
  const loading = auth.loading || profileLoading

  return {
    userId,
    // Normalize profile to null instead of undefined for consistent type handling
    // Components expect ProfileResponse | null, not ProfileResponse | undefined
    profile: profile ?? null,
    displayName,
    loading,
    error,
    isAuthenticated: auth.isAuthenticated,
  }
}
