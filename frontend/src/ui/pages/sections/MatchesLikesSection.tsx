import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../../api/client'
import type { AccessStatus } from '../../../api/types'
import { useAuth } from '../../../core/auth/useAuth'
import { prettyIntent } from '../../../core/format/prettyIntent'
import { useMatches } from '../../../core/matches/useMatches'
import { useLikes } from '../../../core/matches/useLikes'
import { ConnectionRow, type ConnectionRowAction } from '../../connections/ConnectionRow'
import type { CountRegister, HeaderRegister } from './connectionTypes'
import { formatConnectionTimestamp } from './formatConnectionTimestamp'
import { LOADING_COUNT, readyCount } from './sectionsConfig'
import { useAsyncAction } from './useAsyncAction'

export function MatchesSection({
  registerHeader,
  registerCount,
}: {
  registerHeader: HeaderRegister
  registerCount: CountRegister
}) {
  const nav = useNavigate()
  const { userId } = useAuth()
  const { data, loading, error, refresh } = useMatches()
  const matches = data?.matches ?? []

  const refreshSafe = useCallback(() => {
    if (loading) return
    refresh()
  }, [loading, refresh])

  useLayoutEffect(() => {
    registerHeader('matches', { onRefresh: refreshSafe, refreshDisabled: loading })
  }, [registerHeader, refreshSafe, loading])

  useLayoutEffect(() => {
    if (loading || error) {
      registerCount('matches', LOADING_COUNT)
      return
    }
    registerCount('matches', readyCount(matches.length))
  }, [registerCount, matches.length, error, loading])

  return (
    <div>
      {loading && <div className="u-muted u-mt-4">Loading matches...</div>}

      {Boolean(error) && !loading && (
        <div className="inboxState inboxState--error" role="alert">
          <div>Match error</div>
          <div className="u-muted">{String(error)}</div>
          <button className="actionBtn" type="button" onClick={refreshSafe}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && matches.length === 0 && (
        <div className="inboxState" role="status" aria-live="polite">
          <div>No matches yet</div>
          <div className="u-muted">Keep swiping to start new connections.</div>
        </div>
      )}

      <div className="inbox__list u-mt-4" role="list" aria-label="Matches">
        {matches.map(match => {
          const isA = String(match.userAId) === String(userId ?? '')
          const other = isA ? match.userB : match.userA
          const name = other.profile?.displayName ?? `User ${other.id}`
          const location = other.profile?.locationText
          const intent = other.profile?.intent ? prettyIntent(other.profile.intent) : null
          const subtitle = [location, intent].filter(Boolean).join(' - ')
          const avatarUrl = other.profile?.avatarUrl ?? null
          const canChat = Boolean(match.conversation?.id)
          const onOpen = () => {
            if (canChat && match.conversation?.id) {
              nav(`/connections/inbox/${encodeURIComponent(String(match.conversation.id))}`)
              return
            }
            nav(`/profiles/${encodeURIComponent(String(other.id))}`)
          }

          return (
            <ConnectionRow
              key={String(match.id)}
              id={String(match.id)}
              title={name}
              subtitle={subtitle}
              statusLabel={canChat ? null : 'Pending'}
              timestamp={formatConnectionTimestamp(match.updatedAt)}
              avatarUrl={avatarUrl}
              profileId={String(other.id)}
              actions={
                canChat
                  ? [
                      {
                        label: 'Chat',
                        variant: 'primary',
                        onClick: onOpen,
                      },
                    ]
                  : undefined
              }
              onOpen={onOpen}
              onOpenProfile={() => nav(`/profiles/${encodeURIComponent(String(other.id))}`)}
            />
          )
        })}
      </div>
    </div>
  )
}

export function LikesSection({
  registerHeader,
  registerCount,
}: {
  registerHeader: HeaderRegister
  registerCount: CountRegister
}) {
  const nav = useNavigate()
  const { data, loading, error, refresh } = useLikes()
  const likes = useMemo(() => data?.likes ?? [], [data?.likes])
  const { processing, actionError, runAction, clearActionError } = useAsyncAction()
  const [followStatus, setFollowStatus] = useState<Record<string, AccessStatus>>({})

  const refreshWithReset = useCallback(() => {
    clearActionError()
    if (loading) return
    refresh()
  }, [clearActionError, loading, refresh])

  useLayoutEffect(() => {
    registerHeader('likes', { onRefresh: refreshWithReset, refreshDisabled: loading })
  }, [registerHeader, refreshWithReset, loading])

  useLayoutEffect(() => {
    if (loading || error) {
      registerCount('likes', LOADING_COUNT)
      return
    }
    registerCount('likes', readyCount(likes.length))
  }, [registerCount, likes.length, error, loading])

  useEffect(() => {
    setFollowStatus(prev => {
      if (likes.length === 0) return {}
      const next: Record<string, AccessStatus> = {}
      for (const item of likes) {
        const key = String(item.userId)
        if (prev[key]) {
          next[key] = prev[key]
        }
      }
      return next
    })
  }, [likes])

  const handleUnlike = async (userId: string) => {
    await runAction({
      key: `like:${userId}`,
      action: async () => {
        await api.like({ toUserId: userId, action: 'UNLIKE' })
      },
      errorMessage: 'Failed to remove like',
      onSuccess: refreshWithReset,
    })
  }

  const handleRequestFollow = async (userId: string) => {
    await runAction({
      key: `follow:${userId}`,
      action: async () => {
        const res = await api.profileAccessRequest(userId)
        setFollowStatus(prev => ({ ...prev, [userId]: res.status }))
      },
      errorMessage: 'Failed to request follow',
      onSuccess: refreshWithReset,
    })
  }

  const errorMessage = actionError ?? (error ? String(error) : null)
  const errorTitle = actionError ? 'Like action failed' : 'Likes error'

  return (
    <div>
      {loading && <div className="u-muted u-mt-4">Loading likes...</div>}

      {Boolean(errorMessage) && !loading && (
        <div className="inboxState inboxState--error" role="alert">
          <div>{errorTitle}</div>
          <div className="u-muted">{errorMessage}</div>
          <button className="actionBtn" type="button" onClick={refreshWithReset}>
            Retry
          </button>
        </div>
      )}

      {!loading && !errorMessage && likes.length === 0 && (
        <div className="inboxState" role="status" aria-live="polite">
          <div>No likes yet</div>
          <div className="u-muted">Start swiping to like new profiles.</div>
        </div>
      )}

      <div className="inbox__list u-mt-4" role="list" aria-label="Likes">
        {likes.map(item => {
          const name = item.profile?.displayName ?? `User ${item.userId}`
          const location = item.profile?.locationText
          const intent = item.profile?.intent ? prettyIntent(item.profile.intent) : null
          const subtitle = [location, intent].filter(Boolean).join(' - ')
          const status = followStatus[String(item.userId)]
          const statusLabel = getLikeStatusLabel(status)
          const requestDisabled = Boolean(status && (status === 'PENDING' || status === 'GRANTED'))
          const userId = String(item.userId)
          const likeKey = `like:${userId}`
          const followKey = `follow:${userId}`
          const isUnliking = Boolean(processing[likeKey])
          const isRequesting = Boolean(processing[followKey])

          const actions: ConnectionRowAction[] = [
            {
              label: isUnliking ? 'Removing...' : 'Unlike',
              variant: 'danger',
              onClick: () => {
                if (isUnliking) return
                handleUnlike(userId)
              },
              disabled: isUnliking,
            },
            {
              label: isRequesting ? 'Requesting...' : 'Request follow',
              variant: 'primary',
              onClick: () => {
                if (isRequesting) return
                handleRequestFollow(userId)
              },
              disabled: requestDisabled || isRequesting,
            },
          ]

          return (
            <ConnectionRow
              key={String(item.id)}
              id={String(item.id)}
              title={name}
              subtitle={subtitle}
              statusLabel={statusLabel}
              timestamp={formatConnectionTimestamp(item.likedAt)}
              avatarUrl={item.profile?.avatarUrl ?? null}
              profileId={userId}
              actions={actions}
              onOpen={() => nav(`/profiles/${encodeURIComponent(userId)}`)}
              onOpenProfile={() => nav(`/profiles/${encodeURIComponent(userId)}`)}
            />
          )
        })}
      </div>
    </div>
  )
}

function getLikeStatusLabel(status?: AccessStatus) {
  switch (status) {
    case 'PENDING':
      return 'Follow requested'
    case 'GRANTED':
      return 'Following'
    case 'DENIED':
      return 'Request denied'
    case 'REVOKED':
      return 'Request revoked'
    case 'CANCELED':
      return 'Request canceled'
    default:
      return 'Liked'
  }
}
