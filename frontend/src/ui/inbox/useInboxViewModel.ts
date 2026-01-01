import { useMemo } from 'react'
import { useInbox } from '../../core/messaging/useInbox'
import type { AccessStatus } from '../../api/types'

type FollowRequestRef = {
  id: string
  status: AccessStatus
}

export function useInboxViewModel() {
  const { data, loading, loadingMore, error, refresh, loadMore } = useInbox()

  const conversations = useMemo(() => {
    return (data?.conversations ?? []).map(c => {
      const other = c.otherUser
      const profile = other?.profile
      const lastMessage = c.lastMessage ?? null
      const followRequest = lastMessage?.followRequest ?? null

      return {
        id: String(c.id),
        conversationId: String(c.id),
        profileId: other ? String(other.id) : null,
        name: profile?.displayName ?? 'Unknown user',
        avatarUrl: profile?.avatarUrl ?? null,
        lastBody: lastMessage?.body ?? '',
        timestamp: lastMessage?.createdAt ?? c.updatedAt,
        lastSenderId: lastMessage?.senderId ? String(lastMessage.senderId) : null,
        lastIsSystem: Boolean(lastMessage?.isSystem),
        followRequest: followRequest
          ? ({
              id: String(followRequest.id),
              status: followRequest.status,
            } satisfies FollowRequestRef)
          : null,
        unreadCount: c.unreadCount ?? 0,
      }
    })
  }, [data])

  return {
    conversations,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
    nextCursorId: data?.nextCursorId ?? null,
  }
}
