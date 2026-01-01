import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { api } from '../../api/client'
import type { FeedCard } from '../../api/types'
import type { DetectedMedia } from '../form/SmartTextarea'
import { captureFromCamera, captureAudio } from '../../core/media/mediaCapture'
import { useOptimisticFeed } from '../../core/feed/useOptimisticFeed'
import { Toast } from '../ui/Toast'
import { useNetworkStatus } from '../../core/network/useNetworkStatus'
import {
  dispatchFeedOptimisticInsert,
  dispatchFeedRefresh,
  dispatchFeedRemoveOptimistic,
} from '../../core/feed/feedEvents'
import { initialPostComposerState, postComposerReducer } from './postComposerState'
import { usePostDraftPersistence } from './usePostDraftPersistence'
import { usePostFileSelection } from './usePostFileSelection'
import { usePostFileUpload } from './usePostFileUpload'
import { usePostLinkPreviews } from './usePostLinkPreviews'
import { ACCEPTED_MEDIA_TYPES, ALLOWED_MIME_TYPES } from '../../core/media/mediaConstants'
import { PostContentModalHeader } from './PostContentModalHeader'
import { PostContentModalBody } from './PostContentModalBody'
import { PostContentModalActions } from './PostContentModalActions'

type Props = {
  open: boolean
  onClose: () => void
  onPosted?: () => void
}

const ACCEPTED_TYPES = ACCEPTED_MEDIA_TYPES
const ACCEPTED_MIME_TYPES = ALLOWED_MIME_TYPES
const ACCEPTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'ogg', 'mp3', 'wav'])
const MAX_FILE_BYTES = 1024 * 1024 * 1024
const MAX_TEXT_LENGTH = 320
const MAX_TAG_LENGTH = 24
const MAX_AUDIO_CAPTURE_MS = 60000
const CLOSE_CONFIRM_MESSAGE = 'Discard this draft?'
const ERROR_TOAST_MS = 6000
const SUCCESS_TOAST_MS = 2200
const SUCCESS_CLOSE_DELAY_MS = 1200
const TAG_PATTERN = /^[a-z0-9][a-z0-9-]*$/i

const TAG_SUGGESTIONS = [
  'dating',
  'relationship',
  'friendship',
  'travel',
  'food',
  'music',
  'art',
  'sports',
  'fitness',
  'photography',
  'writing',
  'gaming',
]

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

const getFocusableElements = (container: HTMLElement | null) => {
  if (!container) return []
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  return nodes.filter(node => !node.hasAttribute('disabled') && node.tabIndex !== -1)
}

export function PostContentModal({ open, onClose, onPosted }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const textInputRef = useRef<HTMLDivElement | null>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)
  const wasOfflineRef = useRef(false)
  const closeTimerRef = useRef<number | null>(null)
  const { createOptimisticPost } = useOptimisticFeed()
  const { isOnline } = useNetworkStatus()
  const [state, dispatch] = useReducer(postComposerReducer, initialPostComposerState)
  const [successToast, setSuccessToast] = useState<string | null>(null)
  const {
    text,
    files,
    detected,
    tags,
    linkPreviews,
    busy,
    error,
    visibility,
    uploadProgress,
    capturing,
  } = state

  const { clearDraft } = usePostDraftPersistence({
    open,
    text,
    files,
    visibility,
    tags,
    dispatch,
  })

  const { addFiles, removeFile, clearFiles, reorderFiles, cleanupPreviews } = usePostFileSelection({
    files,
    acceptedMimeTypes: ACCEPTED_MIME_TYPES,
    acceptedExtensions: ACCEPTED_EXTENSIONS,
    maxFileBytes: MAX_FILE_BYTES,
    dispatch,
  })

  const { uploadFiles, abortUploads } = usePostFileUpload({ dispatch })

  usePostLinkPreviews({ detected, linkPreviews, dispatch })

  const trimmedText = text.trim()
  const hasUnsaved = useMemo(
    () => !!(trimmedText || files.length > 0 || tags.length > 0),
    [files.length, tags.length, trimmedText]
  )

  useEffect(() => {
    if (!open) {
      wasOfflineRef.current = false
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      abortUploads()
      cleanupPreviews()
      dispatch({ type: 'reset' })
      setSuccessToast(null)
    }
  }, [abortUploads, cleanupPreviews, dispatch, open])

  useEffect(() => {
    if (!open) return
    lastFocusedRef.current = document.activeElement as HTMLElement | null
    const focusTimer = window.setTimeout(() => {
      textInputRef.current?.focus()
    }, 0)
    return () => {
      window.clearTimeout(focusTimer)
      lastFocusedRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      abortUploads()
      cleanupPreviews()
    }
  }, [abortUploads, cleanupPreviews])

  useEffect(() => {
    if (!open) return
    if (!isOnline) {
      if (!wasOfflineRef.current) {
        dispatch({
          type: 'setError',
          value: 'You are offline. Reconnect to post.',
        })
        wasOfflineRef.current = true
      }
      return
    }
    if (wasOfflineRef.current) {
      dispatch({ type: 'setError', value: 'Back online.' })
      wasOfflineRef.current = false
    }
  }, [dispatch, isOnline, open])

  const handleRequestClose = useCallback(() => {
    if (busy) return
    if (hasUnsaved) {
      const shouldClose = window.confirm(CLOSE_CONFIRM_MESSAGE)
      if (!shouldClose) return
    }
    onClose()
  }, [busy, hasUnsaved, onClose])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleRequestClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleRequestClose, open])

  const handleTextChange = useCallback(
    (value: string) => dispatch({ type: 'setText', value }),
    [dispatch]
  )

  const handleDetectMedia = useCallback(
    (items: DetectedMedia[]) => dispatch({ type: 'setDetected', value: items }),
    [dispatch]
  )

  const handleTagsChange = useCallback(
    (value: string[]) => dispatch({ type: 'setTags', value }),
    [dispatch]
  )

  const handleVisibilityChange = useCallback(
    (value: 'PUBLIC' | 'PRIVATE') => dispatch({ type: 'setVisibility', value }),
    [dispatch]
  )

  const handleFilesSelected = useCallback(
    (selectedFiles: File[]) => {
      dispatch({ type: 'setError', value: null })
      addFiles(selectedFiles)
    },
    [addFiles, dispatch]
  )

  const handleCaptureCamera = useCallback(async () => {
    dispatch({ type: 'setCapturing', value: 'camera' })
    dispatch({ type: 'setError', value: null })
    try {
      const file = await captureFromCamera({ video: false })
      if (file) {
        addFiles([file])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to capture from camera'
      dispatch({ type: 'setError', value: msg })
    } finally {
      dispatch({ type: 'setCapturing', value: null })
    }
  }, [addFiles, dispatch])

  const handleCaptureAudio = useCallback(async () => {
    dispatch({ type: 'setCapturing', value: 'audio' })
    dispatch({ type: 'setError', value: null })
    try {
      const file = await captureAudio(MAX_AUDIO_CAPTURE_MS)
      if (file) {
        addFiles([file])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to record audio'
      dispatch({ type: 'setError', value: msg })
    } finally {
      dispatch({ type: 'setCapturing', value: null })
    }
  }, [addFiles, dispatch])

  const handleSubmit = useCallback(async () => {
    if (!isOnline) {
      dispatch({ type: 'setError', value: 'You are offline. Reconnect to post.' })
      return
    }

    const body = trimmedText
    if (!body && files.length === 0) {
      dispatch({ type: 'setError', value: 'Add text or at least one photo.' })
      return
    }

    const normalizedTags = Array.from(
      new Set(tags.map(tag => tag.trim().toLowerCase()).filter(Boolean))
    )
    const invalidTag = normalizedTags.find(
      tag => tag.length > MAX_TAG_LENGTH || !TAG_PATTERN.test(tag)
    )
    if (invalidTag) {
      dispatch({
        type: 'setError',
        value: `Tags must be ${MAX_TAG_LENGTH} characters or less and use letters, numbers, or hyphens.`,
      })
      return
    }

    dispatch({ type: 'setBusy', value: true })
    dispatch({ type: 'setError', value: null })
    dispatch({ type: 'setUploadProgress', value: {} })

    let optimisticCard: FeedCard | null = null

    try {
      const { mediaIds, errors } = await uploadFiles(files)

      if (mediaIds.length === 0 && files.length > 0) {
        dispatch({ type: 'setError', value: 'All uploads failed. Please try again.' })
        return
      }

      if (errors.length > 0) {
        dispatch({ type: 'setError', value: `Some uploads failed: ${errors.join(', ')}` })
      }

      // Only create optimistic post for PUBLIC posts (before API call)
      if (visibility === 'PUBLIC') {
        optimisticCard = createOptimisticPost(
          body,
          files.map(f => ({ url: f.preview, thumbUrl: f.preview })),
          visibility
        )

        // Dispatch event for optimistic feed insert and scroll
        dispatchFeedOptimisticInsert(optimisticCard)
      }

      // Create post
      const postResult = await api.posts.create({
        text: body ? body : null,
        visibility,
        mediaIds: mediaIds.length ? mediaIds : undefined,
        tags: normalizedTags.length ? normalizedTags : undefined,
      })

      // For PUBLIC posts, trigger feed refresh to get the real post
      // The optimistic post will be replaced naturally when the feed loads
      if (optimisticCard && visibility === 'PUBLIC') {
        dispatchFeedRefresh({
          removeOptimisticId: optimisticCard.id,
          newPostId: String(postResult.id),
        })
      }

      // Clear draft on success
      clearDraft()
      cleanupPreviews()
      dispatch({ type: 'reset' })
      setSuccessToast('Post published!')
      onPosted?.()
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current)
      }
      closeTimerRef.current = window.setTimeout(() => {
        setSuccessToast(null)
        onClose()
      }, SUCCESS_CLOSE_DELAY_MS)
    } catch (err) {
      const isAbortError =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError')
      if (isAbortError) return
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
      const msg = err instanceof Error ? err.message : 'Failed to publish post'
      const finalMessage = isOffline ? 'Network error. Check your connection.' : msg
      dispatch({ type: 'setError', value: finalMessage })

      // Remove optimistic post if backend fails
      if (optimisticCard) {
        dispatchFeedRemoveOptimistic({ optimisticId: optimisticCard.id, error: finalMessage })
      }
    } finally {
      dispatch({ type: 'setBusy', value: false })
    }
  }, [
    cleanupPreviews,
    clearDraft,
    createOptimisticPost,
    dispatch,
    files,
    isOnline,
    onClose,
    onPosted,
    tags,
    trimmedText,
    uploadFiles,
    visibility,
  ])

  const handleRetryUpload = useCallback(() => {
    void handleSubmit()
  }, [handleSubmit])

  const progressMeta = useMemo(() => {
    const values = Object.values(uploadProgress)
    const completed = values.filter(p => p.status === 'complete').length
    const hasErrors = values.some(p => p.status === 'error')
    const allComplete =
      files.length > 0 &&
      values.length === files.length &&
      values.every(p => p.status === 'complete' || p.status === 'error')
    const totalProgress =
      values.length === 0
        ? 0
        : Math.round(values.reduce((sum, value) => sum + value.progress, 0) / values.length)
    return {
      values,
      completed,
      hasErrors,
      allComplete,
      totalProgress,
    }
  }, [files.length, uploadProgress])

  const isSubmitDisabled = useMemo(
    () =>
      busy ||
      !isOnline ||
      (progressMeta.allComplete &&
        progressMeta.hasErrors &&
        files.length > 0 &&
        progressMeta.completed === 0),
    [busy, files.length, isOnline, progressMeta]
  )

  const handlePanelKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Tab') {
        const focusable = getFocusableElements(panelRef.current)
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement
        if (event.shiftKey && active === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && active === last) {
          event.preventDefault()
          first?.focus()
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!isSubmitDisabled) {
          void handleSubmit()
        }
      }
    },
    [handleSubmit, isSubmitDisabled]
  )

  if (!open) return null

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label="Create post"
      data-testid="post-content-modal"
    >
      <Toast
        message={error}
        onClose={() => dispatch({ type: 'setError', value: null })}
        durationMs={busy ? 0 : ERROR_TOAST_MS}
        role="alert"
      />
      <Toast
        message={successToast}
        onClose={() => setSuccessToast(null)}
        durationMs={SUCCESS_TOAST_MS}
        role="status"
      />
      <div className="modal__backdrop" onClick={handleRequestClose} />
      <div
        className="modal__panel"
        ref={panelRef}
        onKeyDown={handlePanelKeyDown}
        data-testid="post-content-panel"
      >
        <PostContentModalHeader />

        <PostContentModalBody
          text={text}
          onTextChange={handleTextChange}
          onDetectMedia={handleDetectMedia}
          textInputRef={textInputRef}
          maxTextLength={MAX_TEXT_LENGTH}
          visibility={visibility}
          busy={busy}
          onVisibilityChange={handleVisibilityChange}
          files={files}
          uploadProgress={uploadProgress}
          progressMeta={progressMeta}
          onRemoveFile={removeFile}
          onReorderFile={reorderFiles}
          tags={tags}
          onTagsChange={handleTagsChange}
          tagSuggestions={TAG_SUGGESTIONS}
          linkPreviews={linkPreviews}
          capturing={capturing}
          onCaptureCamera={handleCaptureCamera}
          onCaptureAudio={handleCaptureAudio}
          onClearFiles={clearFiles}
          onRetryUpload={handleRetryUpload}
          isOnline={isOnline}
          fileRef={fileRef}
          acceptedTypes={ACCEPTED_TYPES}
          onFilesSelected={handleFilesSelected}
          detectedCount={detected.length}
        />

        <PostContentModalActions
          busy={busy}
          isSubmitDisabled={isSubmitDisabled}
          onCancel={handleRequestClose}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  )
}
