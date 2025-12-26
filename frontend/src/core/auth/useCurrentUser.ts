import { api } from '../../api/client'
import { useAsync } from '../hooks/useAsync'
import { useSession } from './useSession'

export function useCurrentUser() {
  const session = useSession()
  const userId = session.data?.userId
  const { data: profile, error, loading: profileLoading } = useAsync(async (signal) => {
    if (!userId) return null
    try {
      return await api.profile(userId, signal)
    } catch {
      return null
    }
  }, [userId])

  const displayName = profile?.name ? profile.name : (userId ? `User ${userId}` : null)
  const loading = session.loading || profileLoading

  return { userId, profile, displayName, loading, error, session }
}
