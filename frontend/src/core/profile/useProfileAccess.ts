import { useCallback, useState } from 'react'
import { api } from '../../api/client'
import type { ProfileAccessInfo } from '../../api/types'
import { ACCESS_STATUS } from './accessStatus'

type AccessRequestState = {
  busy: boolean
  error: string | null
}

export function useProfileAccess(
  userId: string | number | undefined,
  onAccessUpdate: (access: ProfileAccessInfo | null) => void
) {
  const [state, setState] = useState<AccessRequestState>({ busy: false, error: null })

  const requestAccess = useCallback(async () => {
    if (!userId) return

    setState({ busy: true, error: null })
    try {
      const res = await api.profileAccessRequest(userId)
      onAccessUpdate({
        status: res.status as ProfileAccessInfo['status'],
        requestId: res.requestId ?? null,
        hasPrivatePosts: false, // Will be updated by profile refresh
        hasPrivateMedia: false, // Will be updated by profile refresh
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to request access'
      setState({ busy: false, error: message })
      return
    }
    setState({ busy: false, error: null })
  }, [userId, onAccessUpdate])

  return {
    requestAccess,
    busy: state.busy,
    error: state.error,
  }
}
