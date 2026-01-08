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
    role: session.data?.role,
    isAdmin: session.data?.role === 'ADMIN' || session.data?.role === 'SUPER_ADMIN',
    isSuperAdmin: session.data?.role === 'SUPER_ADMIN',
    loading: session.loading,
    error: session.error,
  }
}
