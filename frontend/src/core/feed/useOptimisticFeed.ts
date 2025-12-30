import { useCallback } from 'react'
import type { FeedCard } from '../../api/types'
import { useCurrentUser } from '../auth/useCurrentUser'

export function useOptimisticFeed() {
  const currentUser = useCurrentUser()

  const createOptimisticPost = useCallback(
    (
      text: string | null,
      media: Array<{ url: string; thumbUrl?: string | null }>,
      _visibility: 'PUBLIC' | 'PRIVATE'
    ): FeedCard => {
      // Use stable UUID-based ID prefix to avoid collisions
      const uuid = crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      const optimisticId = `optimistic:post:${uuid}`
      return {
        id: optimisticId,
        kind: 'post',
        actor: {
          id: currentUser.userId!,
          name: currentUser.displayName || 'You',
          avatarUrl: currentUser.profile?.avatarUrl ?? undefined,
        },
        content: {
          id: optimisticId,
          body: text ?? undefined,
          createdAt: new Date().toISOString(),
        },
        heroUrl: media[0]?.url ?? media[0]?.thumbUrl ?? undefined,
        media:
          media.length > 0
            ? media.map((m, idx) => ({
                id: `optimistic-media-${idx}`,
                type: 'IMAGE' as const,
                url: m.url,
                thumbUrl: m.thumbUrl ?? m.url,
              }))
            : undefined,
        presentation: {
          mode: media.length > 1 ? 'mosaic' : 'single',
          heroIndex: 0,
        },
        stats: {
          likeCount: 0,
          commentCount: 0,
        },
        flags: {
          personalized: false,
          optimistic: true,
        },
      }
    },
    [currentUser]
  )

  return { createOptimisticPost }
}
