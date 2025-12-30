import { useSession } from './useSession'

/**
 * Simple hook for authentication state.
 * Use this for route protection and auth decisions.
 * For profile data, use useCurrentUser() instead.
 */
export function useAuth() {
  const session = useSession()
  return {
    isAuthenticated: Boolean(session.data?.userId),
    userId: session.data?.userId,
    loading: session.loading,
    error: session.error,
  }
}
