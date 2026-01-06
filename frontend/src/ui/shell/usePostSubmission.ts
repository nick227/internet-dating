/**
 * Consolidated hook for post submission logic
 * Handles uploads, API calls, optimistic updates, and error handling
 */
import { useCallback, useRef } from 'react'
import { api } from '../../api/client'
import type { FeedCard } from '../../api/types'
import { useOptimisticFeed } from '../../core/feed/useOptimisticFeed'
import {
  dispatchFeedOptimisticInsert,
  dispatchFeedRefresh,
  dispatchFeedRemoveOptimistic,
} from '../../core/feed/feedEvents'
import { useMediaUpload } from '../../core/media/useMediaUpload'
import { validatePostContent, normalizeTags, validateTags } from './postComposerValidation'
import type { FileWithPreview } from './postComposerState'
import type { FeedTarget } from './usePostFormState'
import { useCurrentUser } from '../../core/auth/useCurrentUser'

type SubmissionOptions = {
  text: string
  files: FileWithPreview[]
  tags: string[]
  visibility: 'PUBLIC' | 'PRIVATE'
  feedTarget: FeedTarget
  targetUserId: string | null
  isOnline: boolean
  onProgressUpdate: (fileId: string, progress: { progress: number; status: 'pending' | 'uploading' | 'complete' | 'error'; error?: string }) => void
  onError: (error: string) => void
  onSuccess: () => void
}

type SubmissionResult = {
  success: boolean
  error?: string
}

export function usePostSubmission() {
  const { createOptimisticPost } = useOptimisticFeed()
  const { uploadFiles: uploadMediaFiles, abortAll } = useMediaUpload()
  const { userId: currentUserId } = useCurrentUser()
  const abortControllerRef = useRef<AbortController | null>(null)

  const submit = useCallback(
    async (options: SubmissionOptions): Promise<SubmissionResult> => {
      const { text, files, tags, visibility, feedTarget, targetUserId, isOnline, onProgressUpdate, onError, onSuccess } = options

      // Validate content
      const contentValidation = validatePostContent(text, files.length)
      if (!contentValidation.valid) {
        onError(contentValidation.error || 'Invalid content')
        return { success: false, error: contentValidation.error }
      }

      // Validate tags
      const tagsValidation = validateTags(tags)
      if (!tagsValidation.valid) {
        onError(tagsValidation.error || 'Invalid tags')
        return { success: false, error: tagsValidation.error }
      }

      // Check online status
      if (!isOnline) {
        const error = 'You are offline. Reconnect to post.'
        onError(error)
        return { success: false, error }
      }

      // Normalize tags
      const normalizedTags = normalizeTags(tags)

      // Initialize upload progress
      files.forEach(file => {
        onProgressUpdate(file.id, { progress: 0, status: 'pending' })
      })

      // Update to uploading
      files.forEach(file => {
        onProgressUpdate(file.id, { progress: 0, status: 'uploading' })
      })

      // Create abort controller for this submission
      const controller = new AbortController()
      abortControllerRef.current = controller

      let optimisticCard: FeedCard | null = null

      try {
        // Upload files
        const fileArray = files.map(f => f.file)
        const { results, errors: uploadErrors } = await uploadMediaFiles(fileArray, {
          signal: controller.signal,
          onProgress: (progress, fileIndex) => {
            if (fileIndex !== undefined && files[fileIndex]) {
              const fileId = files[fileIndex].id
              const status = progress.loaded === progress.total ? 'complete' : 'uploading'
              const progressPercent = progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0
              onProgressUpdate(fileId, {
                progress: status === 'complete' ? 100 : progressPercent,
                status: status === 'complete' ? 'complete' : 'uploading',
              })
            }
          },
        })

        // Update progress for completed uploads
        results.forEach((result, index) => {
          const fileId = files[index]?.id
          if (fileId) {
            onProgressUpdate(fileId, { progress: 100, status: 'complete' })
          }
        })

        // Update progress for failed uploads
        uploadErrors.forEach(error => {
          const fileId = files.find(f => f.file === error.file)?.id
          if (fileId) {
            const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
            const errorMessage = isOffline ? 'Network error. Check your connection.' : error.error
            onProgressUpdate(fileId, { progress: 0, status: 'error', error: errorMessage })
          }
        })

        // Check if we have any successful uploads
        if (results.length === 0 && files.length > 0) {
          onError('All uploads failed. Please try again.')
          return { success: false, error: 'All uploads failed' }
        }

        // Report upload errors but continue if we have at least one success
        if (uploadErrors.length > 0 && results.length > 0) {
          onError(`Some uploads failed: ${uploadErrors.map(e => e.error).join(', ')}`)
        }

        // Create optimistic post for both PUBLIC and PRIVATE (user should see their own posts immediately)
        optimisticCard = createOptimisticPost(
          text.trim() || null,
          files.map(f => ({ url: f.preview, thumbUrl: f.preview })),
          visibility
        )

        // Dispatch optimistic insert
        dispatchFeedOptimisticInsert(optimisticCard)

        // Determine targetUserId based on feedTarget
        // - 'profile': post to profile feed (targetUserId = specified target or current user)
        // - 'main': post to main feed (targetUserId = null, appears in main feed and author's profile)
        // - 'both': post to both (targetUserId = null, appears in both feeds)
        let finalTargetUserId: string | null = null
        if (feedTarget === 'profile') {
          // If targetUserId is provided, use it; otherwise use current user's ID
          finalTargetUserId = targetUserId || (currentUserId ? String(currentUserId) : null)
        } else if (feedTarget === 'main' || feedTarget === 'both') {
          finalTargetUserId = null
        }

        // Create post via API
        const postResult = await api.posts.create(
          {
            text: text.trim() || null,
            visibility,
            mediaIds: results.length ? results.map(r => r.mediaId) : undefined,
            tags: normalizedTags.length ? normalizedTags : undefined,
            targetUserId: finalTargetUserId || undefined,
          },
          controller.signal
        )

        // Trigger feed refresh to replace optimistic post with real one
        dispatchFeedRefresh({
          removeOptimisticId: optimisticCard.id,
          newPostId: String(postResult.id),
        })

        onSuccess()
        return { success: true }
      } catch (err) {
        // Handle abort errors silently
        const isAbortError =
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError')
        if (isAbortError) {
          return { success: false, error: 'Aborted' }
        }

        // Remove optimistic post on error
        if (optimisticCard) {
          const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
          const errorMessage =
            isOffline
              ? 'Network error. Check your connection.'
              : err instanceof Error
                ? err.message
                : 'Failed to publish post'
          dispatchFeedRemoveOptimistic({ optimisticId: optimisticCard.id, error: errorMessage })
          onError(errorMessage)
          return { success: false, error: errorMessage }
        }

        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
        const errorMessage =
          isOffline
            ? 'Network error. Check your connection.'
            : err instanceof Error
              ? err.message
              : 'Failed to publish post'
        onError(errorMessage)
        return { success: false, error: errorMessage }
      } finally {
        abortControllerRef.current = null
      }
    },
    [createOptimisticPost, uploadMediaFiles, currentUserId]
  )

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortAll()
  }, [abortAll])

  return { submit, abort }
}
