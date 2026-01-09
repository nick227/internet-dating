import { useCallback } from 'react'
import type { FeedCard } from '../../api/types'
import { useCurrentUser } from '../auth/useCurrentUser'
import { parseEmbedUrl } from '../media/embedMedia'

export function useOptimisticFeed() {
  const currentUser = useCurrentUser()

  const createOptimisticPost = useCallback(
    (
      text: string | null,
      media: Array<{ url: string; thumbUrl?: string | null }>,
      embedUrls: string[],
      _visibility: 'PUBLIC' | 'PRIVATE'
    ): FeedCard => {
      // Use stable UUID-based ID prefix to avoid collisions
      const uuid = crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      const optimisticId = `optimistic:post:${uuid}`
      const embedMedia = embedUrls
        .map((url, idx) => {
          const info = parseEmbedUrl(url)
          if (!info) return null
          return {
            id: `optimistic-embed-${idx}`,
            type: 'EMBED' as const,
            url: info.url,
            thumbUrl: info.thumbUrl ?? null,
          }
        })
        .filter(Boolean) as Array<{ id: string; type: 'EMBED'; url: string; thumbUrl?: string | null }>

      const fileMedia =
        media.length > 0
          ? media.map((m, idx) => ({
              id: `optimistic-media-${idx}`,
              type: 'IMAGE' as const,
              url: m.url,
              thumbUrl: m.thumbUrl ?? m.url,
            }))
          : []

      const optimisticMedia = [...fileMedia, ...embedMedia]
      const heroUrl =
        fileMedia[0]?.url ??
        fileMedia[0]?.thumbUrl ??
        embedMedia[0]?.thumbUrl ??
        undefined

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
        heroUrl,
        media: optimisticMedia.length > 0 ? optimisticMedia : undefined,
        presentation: {
          mode: optimisticMedia.length > 1 ? 'mosaic' : 'single',
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
