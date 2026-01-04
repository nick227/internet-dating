import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
// eslint-disable-next-line no-restricted-imports -- Rendering raw API list
import type { ApiFollowerItem } from '../../../api/contracts'
import { api } from '../../../api/client'
import { useCurrentUser } from '../../../core/auth/useCurrentUser'
import { getErrorMessage } from '../../../core/utils/errors'
import { ConnectionRow, type ConnectionRowAction } from '../../connections/ConnectionRow'
import type { CountRegister, CountsInvalidator, HeaderRegister } from './connectionTypes'
import { formatConnectionTimestamp } from './formatConnectionTimestamp'
import { LOADING_COUNT, readyCount } from './sectionsConfig'
import { useAsyncAction } from './useAsyncAction'

export function FollowSection({
  registerHeader,
  registerCount,
  invalidateCounts,
  mode,
}: {
  registerHeader: HeaderRegister
  registerCount: CountRegister
  invalidateCounts: CountsInvalidator
  mode: 'followers' | 'following'
}) {
  const nav = useNavigate()
  const { userId, loading: userLoading } = useCurrentUser()
  const [followers, setFollowers] = useState<ApiFollowerItem[]>([])
  const [following, setFollowing] = useState<ApiFollowerItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { processing, actionError, runAction, clearActionError } = useAsyncAction()
  const requestIdRef = useRef(0)
  const loadingRef = useRef(false)

  const loadData = useCallback(async () => {
    if (!userId || loadingRef.current) return
    const requestId = ++requestIdRef.current
    loadingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const [followersRes, followingRes] = await Promise.all([
        api.followers(userId),
        api.following(userId),
      ])
      if (requestIdRef.current !== requestId) return
      setFollowers(followersRes.followers)
      setFollowing(followingRes.following)
      setLoading(false)
      loadingRef.current = false
    } catch (err) {
      if (requestIdRef.current !== requestId) return
      setError(getErrorMessage(err, 'Failed to load'))
      setLoading(false)
      loadingRef.current = false
    }
  }, [userId])

  const refreshWithReset = useCallback(() => {
    clearActionError()
    loadData()
  }, [clearActionError, loadData])

  useEffect(() => {
    if (userLoading || !userId) return
    loadData()
  }, [loadData, userLoading, userId])

  useEffect(() => {
    if (userLoading || !userId) {
      setFollowers([])
      setFollowing([])
      setError(null)
      setLoading(false)
      loadingRef.current = false
    }
  }, [userLoading, userId])

  useLayoutEffect(() => {
    registerHeader(mode, {
      onRefresh: refreshWithReset,
      refreshDisabled: !userId || userLoading || loading,
    })
  }, [registerHeader, refreshWithReset, loading, userId, userLoading])

  useLayoutEffect(() => {
    if (userLoading || loading || error) {
      registerCount(mode, LOADING_COUNT)
      return
    }
    const items = mode === 'followers' ? followers : following
    registerCount(mode, readyCount(items.length))
  }, [registerCount, mode, userLoading, loading, error, followers, following])

  const handleApprove = async (requestId: string) => {
    await runAction({
      key: `follow:${requestId}`,
      action: async () => {
        await api.approveFollowRequest(requestId)
      },
      errorMessage: 'Failed to approve',
      onSuccess: () => {
        invalidateCounts(['matches', 'inbox'])
        refreshWithReset()
      },
    })
  }

  const handleDeny = async (requestId: string) => {
    await runAction({
      key: `follow:${requestId}`,
      action: async () => {
        await api.denyFollowRequest(requestId)
      },
      errorMessage: 'Failed to deny',
      onSuccess: refreshWithReset,
    })
  }

  const handleCancel = async (requestId: string) => {
    await runAction({
      key: `follow:${requestId}`,
      action: async () => {
        await api.cancelFollowRequest(requestId)
      },
      errorMessage: 'Failed to cancel',
      onSuccess: refreshWithReset,
    })
  }

  const handleRevoke = async (requestId: string) => {
    await runAction({
      key: `follow:${requestId}`,
      action: async () => {
        await api.revokeFollowRequest(requestId)
      },
      errorMessage: 'Failed to remove follower',
      onSuccess: refreshWithReset,
    })
  }

  const items = mode === 'followers' ? followers : following
  const showEmpty = !userLoading && !loading && !error && items.length === 0
  const errorMessage = actionError ?? error
  const errorTitle =
    actionError != null
      ? mode === 'followers'
        ? 'Follower action failed'
        : 'Following action failed'
      : mode === 'followers'
        ? 'Followers error'
        : 'Following error'

  return (
    <div>
      {userLoading && <div className="u-muted u-mt-4">Loading account...</div>}
      {loading && <div className="u-muted u-mt-4">Loading {mode}...</div>}

      {Boolean(errorMessage) && !loading && (
        <div className="inboxState inboxState--error" role="alert">
          <div>{errorTitle}</div>
          <div className="u-muted">{errorMessage}</div>
          <button className="actionBtn" type="button" onClick={refreshWithReset}>
            Retry
          </button>
        </div>
      )}

      {showEmpty && (
        <div className="inboxState" role="status" aria-live="polite">
          <div>{mode === 'followers' ? 'No followers yet' : 'Not following anyone yet'}</div>
          <div className="u-muted">
            {mode === 'followers'
              ? 'When someone follows you, they will show up here.'
              : 'Start exploring profiles to follow.'}
          </div>
        </div>
      )}

      <div className="inbox__list u-mt-4" role="list" aria-label={mode}>
        {items.map(item => {
          const statusLabel = getFollowStatusLabel(item.status)
          const timestamp = item.status === 'PENDING' ? item.requestedAt : item.updatedAt
          const actions = getFollowActions({
            item,
            mode,
            processing,
            onApprove: handleApprove,
            onDeny: handleDeny,
            onCancel: handleCancel,
            onRevoke: handleRevoke,
          })

          return (
            <ConnectionRow
              key={item.requestId}
              id={item.requestId}
              title={item.name}
              statusLabel={statusLabel}
              timestamp={formatConnectionTimestamp(timestamp)}
              avatarUrl={item.avatarUrl}
              profileId={String(item.userId)}
              actions={actions}
              onOpen={() => nav(`/profiles/${encodeURIComponent(String(item.userId))}`)}
              onOpenProfile={() => nav(`/profiles/${encodeURIComponent(String(item.userId))}`)}
            />
          )
        })}
      </div>
    </div>
  )
}

function getFollowStatusLabel(status: ApiFollowerItem['status']) {
  switch (status) {
    case 'PENDING':
      return 'Request pending'
    case 'GRANTED':
      return 'Following'
    case 'DENIED':
      return 'Request denied'
    case 'CANCELED':
      return 'Request canceled'
    case 'REVOKED':
      return 'Removed'
    default:
      return ''
  }
}

function getFollowActions({
  item,
  mode,
  processing,
  onApprove,
  onDeny,
  onCancel,
  onRevoke,
}: {
  item: ApiFollowerItem
  mode: 'followers' | 'following'
  processing: Record<string, boolean>
  onApprove: (requestId: string) => void
  onDeny: (requestId: string) => void
  onCancel: (requestId: string) => void
  onRevoke: (requestId: string) => void
}) {
  const busy = Boolean(processing[`follow:${item.requestId}`])
  const actions: ConnectionRowAction[] = []

  if (mode === 'followers') {
    if (item.status === 'PENDING') {
      actions.push(
        {
          label: busy ? 'Approving...' : 'Approve',
          variant: 'primary',
          onClick: () => {
            if (busy) return
            onApprove(item.requestId)
          },
          disabled: busy,
        },
        {
          label: busy ? 'Denying...' : 'Deny',
          onClick: () => {
            if (busy) return
            onDeny(item.requestId)
          },
          disabled: busy,
        }
      )
    } else if (item.status === 'GRANTED') {
      actions.push({
        label: busy ? 'Removing...' : 'Remove',
        variant: 'danger',
        onClick: () => {
          if (busy) return
          onRevoke(item.requestId)
        },
        disabled: busy,
      })
    }
  }

  if (mode === 'following') {
    if (item.status === 'PENDING') {
      actions.push({
        label: busy ? 'Canceling...' : 'Cancel',
        onClick: () => {
          if (busy) return
          onCancel(item.requestId)
        },
        disabled: busy,
      })
    }
  }

  return actions.length > 0 ? actions : undefined
}
