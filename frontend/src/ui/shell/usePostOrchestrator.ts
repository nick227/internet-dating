/**
 * Central orchestrator for post composer
 * Manages all state transitions, cleanup, and coordination in one place
 */
import { useCallback, useRef } from 'react'
import { usePostSubmission } from './usePostSubmission'
import { validatePostContent, validateTags } from './postComposerValidation'
import type { FileWithPreview } from './postComposerState'
import type { FeedTarget } from './usePostFormState'

type OrchestratorState = {
  busy: boolean
  error: string | null
}

type OrchestratorCallbacks = {
  onProgressUpdate: (fileId: string, progress: { progress: number; status: 'pending' | 'uploading' | 'complete' | 'error'; error?: string }) => void
  onBusyChange: (busy: boolean) => void
  onError: (error: string | null) => void
  onSuccess: () => void
  onCleanup: () => void
}

type SubmitOptions = {
  text: string
  files: FileWithPreview[]
  tags: string[]
  visibility: 'PUBLIC' | 'PRIVATE'
  feedTarget: FeedTarget
  targetUserId: string | null
  isOnline: boolean
}

export function usePostOrchestrator(callbacks: OrchestratorCallbacks) {
  const { submit } = usePostSubmission()
  const abortControllerRef = useRef<AbortController | null>(null)
  const stateRef = useRef<OrchestratorState>({ busy: false, error: null })

  const executeSubmit = useCallback(
    async (options: SubmitOptions): Promise<{ success: boolean; error?: string }> => {
      const { text, files, tags, visibility, feedTarget, targetUserId, isOnline } = options

      // Early validation
      const contentValidation = validatePostContent(text, files.length)
      if (!contentValidation.valid) {
        const error = contentValidation.error || 'Invalid content'
        callbacks.onError(error)
        return { success: false, error }
      }

      const tagsValidation = validateTags(tags)
      if (!tagsValidation.valid) {
        const error = tagsValidation.error || 'Invalid tags'
        callbacks.onError(error)
        return { success: false, error }
      }

      if (!isOnline) {
        const error = 'You are offline. Reconnect to post.'
        callbacks.onError(error)
        return { success: false, error }
      }

      // Initialize progress tracking
      files.forEach(file => {
        callbacks.onProgressUpdate(file.id, { progress: 0, status: 'pending' })
      })

      stateRef.current.busy = true
      callbacks.onBusyChange(true)
      callbacks.onError(null)

      // Create abort controller
      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const result = await submit({
          text,
          files,
          tags,
          visibility,
          feedTarget,
          targetUserId,
          isOnline,
          onProgressUpdate: callbacks.onProgressUpdate,
          onError: error => {
            stateRef.current.error = error
            callbacks.onError(error)
            stateRef.current.busy = false
            callbacks.onBusyChange(false)
          },
          onSuccess: () => {
            stateRef.current.busy = false
            callbacks.onBusyChange(false)
            callbacks.onSuccess()
          },
        })

        return result
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to submit post'
        stateRef.current.error = error
        stateRef.current.busy = false
        callbacks.onError(error)
        callbacks.onBusyChange(false)
        return { success: false, error }
      } finally {
        abortControllerRef.current = null
      }
    },
    [submit, callbacks]
  )

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (stateRef.current.busy) {
      stateRef.current.busy = false
      callbacks.onBusyChange(false)
    }
  }, [callbacks])

  const cleanup = useCallback(() => {
    // Explicit cleanup order: abort first, then cleanup tasks
    abort()
    callbacks.onCleanup()
  }, [abort, callbacks])

  return {
    executeSubmit,
    abort,
    cleanup,
    getState: () => stateRef.current,
  }
}
