import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ProfileResponse, ProfilePost, RatingScores } from '../../api/types'
import { toAge } from '../format/toAge'
import { toIdString } from '../utils/ids'

type ProfilePatch = Partial<ProfileResponse>

type PostPatch = Partial<ProfilePost>

/**
 * Hook for managing profile draft state with optimistic updates.
 * Delete operations automatically trigger a refresh to ensure consistency.
 */
export function useProfileDraft(
  profile: ProfileResponse | null | undefined,
  onRefresh?: () => void
) {
  const [draft, setDraft] = useState<ProfileResponse | null>(null)

  // Deep merge: replace entire nested objects/arrays to avoid desync
  useEffect(() => {
    if (!profile) {
      setDraft(null)
      return
    }

    setDraft(current => {
      // First load or userId changed: replace entirely
      if (!current || current.userId !== profile.userId) {
        return profile
      }

      // Merge top-level fields, but replace nested structures
      return {
        ...current,
        ...profile,
        // Replace nested arrays/objects to avoid partial updates
        posts: profile.posts ?? current.posts,
        media: profile.media ?? current.media,
        access: profile.access ?? current.access,
        ratings: profile.ratings ?? current.ratings,
      }
    })
  }, [profile])

  const updateProfile = useCallback((patch: ProfilePatch) => {
    setDraft(current => {
      if (!current) return current
      const next = { ...current, ...patch }
      if (patch.birthdate !== undefined) {
        next.age = toAge(patch.birthdate)
      }
      return next
    })
  }, [])

  const updatePost = useCallback((postId: string | number, patch: PostPatch) => {
    setDraft(current => {
      if (!current) return current
      const postIdStr = toIdString(postId)
      const posts = current.posts ?? []
      const index = posts.findIndex(p => toIdString(p.id) === postIdStr)
      if (index === -1) return current

      const updatedPosts = [...posts]
      updatedPosts[index] = { ...updatedPosts[index], ...patch }

      return { ...current, posts: updatedPosts }
    })
  }, [])

  const deletePost = useCallback(
    (postId: string | number) => {
      setDraft(current => {
        if (!current) return current
        const postIdStr = toIdString(postId)
        const posts = current.posts ?? []
        const index = posts.findIndex(p => toIdString(p.id) === postIdStr)
        if (index === -1) return current

        const updatedPosts = [...posts]
        updatedPosts.splice(index, 1)

        return { ...current, posts: updatedPosts }
      })
      // Refresh after delete to ensure server state consistency
      onRefresh?.()
    },
    [onRefresh]
  )

  const deleteMedia = useCallback(
    (mediaId: string | number) => {
      setDraft(current => {
        if (!current) return current
        const mediaIdStr = toIdString(mediaId)

        const filteredMedia = (current.media ?? []).filter(m => toIdString(m.id) !== mediaIdStr)

        // Update posts that reference the deleted media
        const updatedPosts = (current.posts ?? []).map(post => {
          const postMedia = post.media ?? []
          const hasMedia = postMedia.some(m => toIdString(m.id) === mediaIdStr)
          if (!hasMedia) return post

          return {
            ...post,
            media: postMedia.filter(m => toIdString(m.id) !== mediaIdStr),
          }
        })

        return {
          ...current,
          media: filteredMedia,
          posts: updatedPosts,
        }
      })
      // Refresh after delete to ensure server state consistency
      onRefresh?.()
    },
    [onRefresh]
  )

  const updateAccess = useCallback((access: ProfileResponse['access']) => {
    setDraft(current => {
      if (!current) return current
      return { ...current, access: access ?? null }
    })
  }, [])

  const updateRating = useCallback((rating: RatingScores) => {
    setDraft(current => {
      if (!current) return current
      const nextRatings = current.ratings ?? { count: 0, avg: {}, mine: null }
      return { ...current, ratings: { ...nextRatings, mine: rating } }
    })
  }, [])

  const resolvedProfile = useMemo(() => draft ?? profile, [draft, profile])

  return {
    profile: resolvedProfile,
    updateProfile,
    updatePost,
    deletePost,
    deleteMedia,
    updateAccess,
    updateRating,
  }
}
