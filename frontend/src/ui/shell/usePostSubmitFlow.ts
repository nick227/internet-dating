/**
 * Encapsulates the complete post submission flow
 * Handles validation, uploads, API calls, optimistic updates, and cleanup
 */
import { useCallback, useRef } from 'react'
import { usePostSubmission } from './usePostSubmission'
import { validatePostContent, validateTags } from './postComposerValidation'
import type { FileWithPreview } from './postComposerState'

type SubmitFlowOptions = {
  text: string
  files: FileWithPreview[]
  tags: string[]
  visibility: 'PUBLIC' | 'PRIVATE'
  isOnline: boolean
  onProgressUpdate: (fileId: string, progress: { progress: number; status: 'pending' | 'uploading' | 'complete' | 'error'; error?: string }) => void
  onError: (error: string) => void
  onSuccess: () => void
  onBusyChange: (busy: boolean) => void
}

type SubmitFlowResult = {
  success: boolean
  error?: string
}

export function usePostSubmitFlow() {
  const { submit } = usePostSubmission()
  const abortControllerRef = useRef<AbortController | null>(null)

  const execute = useCallback(
    async (options: SubmitFlowOptions): Promise<SubmitFlowResult> => {
      const { text, files, tags, visibility, isOnline, onProgressUpdate, onError, onSuccess, onBusyChange } = options

      // Early validation
      const contentValidation = validatePostContent(text, files.length)
      if (!contentValidation.valid) {
        onError(contentValidation.error || 'Invalid content')
        return { success: false, error: contentValidation.error }
      }

      const tagsValidation = validateTags(tags)
      if (!tagsValidation.valid) {
        onError(tagsValidation.error || 'Invalid tags')
        return { success: false, error: tagsValidation.error }
      }

      if (!isOnline) {
        const error = 'You are offline. Reconnect to post.'
        onError(error)
        return { success: false, error }
      }

      // Initialize progress tracking
      files.forEach(file => {
        onProgressUpdate(file.id, { progress: 0, status: 'pending' })
      })

      onBusyChange(true)

      // Create abort controller for this submission
      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const result = await submit({
          text,
          files,
          tags,
          visibility,
          isOnline,
          onProgressUpdate,
          onError: error => {
            onError(error)
            onBusyChange(false)
          },
          onSuccess: () => {
            onSuccess()
            onBusyChange(false)
          },
        })

        return result
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to submit post'
        onError(error)
        onBusyChange(false)
        return { success: false, error }
      } finally {
        abortControllerRef.current = null
      }
    },
    [submit]
  )

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  return { execute, abort }
}
