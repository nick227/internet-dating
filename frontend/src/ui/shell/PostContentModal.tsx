import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DetectedMedia } from '../form/SmartTextarea'
import { captureAudio } from '../../core/media/mediaCapture'
import { Toast } from '../ui/Toast'
import { useNetworkStatus } from '../../core/network/useNetworkStatus'
import { ACCEPTED_MEDIA_TYPES } from '../../core/media/mediaConstants'
import { PostContentModalHeader } from './PostContentModalHeader'
import { PostContentModalSheet } from './PostContentModalSheet'
import { PostContentModalActions } from './PostContentModalActions'
import { usePostFormState } from './usePostFormState'
import { usePostFileHandling } from './usePostFileHandling'
import { usePostDraft } from './usePostDraft'
import { usePostLinkPreviews } from './usePostLinkPreviews'
import { usePostCleanup } from './usePostCleanup'
import { usePostOrchestrator } from './usePostOrchestrator'
import { usePostErrorState } from './usePostErrorState'
import { usePostProgress } from './usePostProgress'
import { usePostToast } from './usePostToast'
import {
  MAX_TEXT_LENGTH,
  MAX_AUDIO_CAPTURE_MS,
  CLOSE_CONFIRM_MESSAGE,
  ERROR_TOAST_MS,
  TAG_SUGGESTIONS,
} from './postComposerConstants'
import { normalizeTags, validateTag } from './postComposerValidation'

type Props = {
  open: boolean
  onClose: () => void
  onPosted?: () => void
}

export function PostContentModal({ open, onClose, onPosted }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const textInputRef = useRef<HTMLDivElement | null>(null)
  const { isOnline } = useNetworkStatus()
  const [showCameraCapture, setShowCameraCapture] = useState(false)
  const [sheetTranslateY, setSheetTranslateY] = useState(0)
  const dragStartYRef = useRef(0)
  const isDraggingRef = useRef(false)
  const dragTranslateYRef = useRef(0)

  const {
    state,
    setText,
    setDetected,
    setTags,
    setVisibility,
    setFeedTarget,
    setTargetUserId,
    setBusy,
    setCapturing,
    addFiles: addFilesToState,
    setFiles,
    removeFile: removeFileFromState,
    updateUploadProgress,
    setLinkPreview,
    reset,
  } = usePostFormState()

  const { text, files, detected, tags, linkPreviews, visibility, feedTarget, targetUserId, busy, capturing, uploadProgress } = state

  // Unified error state (single source of truth)
  const { error, setError, clearError } = usePostErrorState()

  // Cleanup management with explicit ordering
  const { register: registerCleanup, execute: executeCleanup } = usePostCleanup()

  // Register cleanup tasks in useEffect to avoid render-time registration
  const { clearDraft } = usePostDraft(
    open,
    text,
    files,
    visibility,
    tags,
    useCallback(
      draft => {
        setText(draft.text)
        setVisibility(draft.visibility)
        setTags(draft.tags)
      },
      [setText, setVisibility, setTags]
    )
  )

  const { addFiles, removeFile, clearFiles, reorderFiles, cleanupPreviews } = usePostFileHandling(
    files,
    addFilesToState,
    removeFileFromState,
    setFiles,
    setError
  )

  const { successToast, showSuccess, dismiss: dismissToast } = usePostToast()

  // Post orchestrator - handles all submission coordination
  const orchestrator = usePostOrchestrator({
    onProgressUpdate: (fileId, progress) => {
      updateUploadProgress(fileId, progress)
    },
    onBusyChange: setBusy,
    onError: error => {
      setError(error)
    },
    onSuccess: () => {
      clearDraft()
      executeCleanup()
      showSuccess('Post published!', () => {
        onPosted?.()
        onClose()
      })
    },
    onCleanup: () => {
      clearDraft()
      reset()
    },
  })

  // Register cleanup tasks with explicit ordering (in useEffect to avoid render-time registration)
  useEffect(() => {
    // Abort must happen first
    const unregisterAbort = registerCleanup(() => {
      orchestrator.abort()
    }, 'first')

    // Then cleanup previews
    const unregisterPreviews = registerCleanup(cleanupPreviews, 'normal')

    // Finally reset state
    const unregisterReset = registerCleanup(() => reset(), 'last')

    return () => {
      unregisterAbort()
      unregisterPreviews()
      unregisterReset()
    }
  }, [registerCleanup, cleanupPreviews, reset, orchestrator])

  usePostLinkPreviews(
    detected,
    linkPreviews,
    useCallback(
      (url, preview, loading) => {
        setLinkPreview(url, preview, loading)
      },
      [setLinkPreview]
    )
  )

  const progressMeta = usePostProgress(files, uploadProgress)

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

  // Single cleanup path - only called when modal closes
  const handleRequestClose = useCallback(async () => {
    if (busy) return

    const trimmedText = text.trim()
    const hasUnsaved = !!(trimmedText || files.length > 0 || tags.length > 0)

    if (hasUnsaved) {
      // Non-blocking: use Promise to avoid blocking render
      const shouldClose = await Promise.resolve(window.confirm(CLOSE_CONFIRM_MESSAGE))
      if (!shouldClose) return
    }

    executeCleanup()
    onClose()
  }, [busy, text, files.length, tags.length, executeCleanup, onClose])

  const resetSheetDrag = useCallback(() => {
    setSheetTranslateY(0)
    dragTranslateYRef.current = 0
    isDraggingRef.current = false
  }, [])

  // Simplified submit handler - orchestrator handles all coordination
  const handleSubmit = useCallback(async () => {
    const trimmedText = text.trim()
    await orchestrator.executeSubmit({
      text: trimmedText,
      files,
      tags,
      visibility,
      feedTarget,
      targetUserId,
      isOnline,
    })
  }, [orchestrator, text, files, tags, visibility, feedTarget, targetUserId, isOnline])

  // Focus first input when the sheet opens (no focus trap for sheets)
  useEffect(() => {
    if (!open || showCameraCapture) return
    const focusTimer = window.setTimeout(() => {
      textInputRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(focusTimer)
  }, [open, showCameraCapture])

  // Single cleanup path on close
  useEffect(() => {
    if (!open) {
      executeCleanup()
      setShowCameraCapture(false)
      resetSheetDrag()
    }
  }, [open, executeCleanup, resetSheetDrag])

  useEffect(() => {
    if (showCameraCapture) {
      resetSheetDrag()
    }
  }, [showCameraCapture, resetSheetDrag])

  // Network status - unified with orchestrator validation
  useEffect(() => {
    if (!open) return
    if (!isOnline) {
      setError('You are offline. Reconnect to post.')
    } else {
      clearError()
    }
  }, [isOnline, open, setError, clearError])

  const handleTextChange = useCallback(
    (value: string) => {
      setText(value)
      clearError()
    },
    [setText, clearError]
  )

  const handleDetectMedia = useCallback(
    (items: DetectedMedia[]) => setDetected(items),
    [setDetected]
  )

  const handleTagsChange = useCallback(
    (newTags: string[]) => {
      const normalized = normalizeTags(newTags)
      const invalidTag = normalized.find(tag => {
        const result = validateTag(tag)
        return !result.valid
      })
      if (invalidTag) {
        const result = validateTag(invalidTag)
        setError(result.error || 'Invalid tag')
      } else {
        clearError()
      }
      setTags(normalized)
    },
    [setTags, setError, clearError]
  )

  const handleVisibilityChange = useCallback(
    (value: 'PUBLIC' | 'PRIVATE') => setVisibility(value),
    [setVisibility]
  )

  const handleFilesSelected = useCallback(
    (selectedFiles: File[]) => {
      clearError()
      addFiles(selectedFiles)
    },
    [addFiles, clearError]
  )

  const handleCaptureCamera = useCallback(async () => {
    setCapturing('camera')
    clearError()
    setShowCameraCapture(true)
  }, [setCapturing, clearError])

  const handleCloseCameraCapture = useCallback(() => {
    setCapturing(null)
    setShowCameraCapture(false)
  }, [setCapturing])

  const handleVideoPost = useCallback(
    (file: File, note: string) => {
      addFiles([file])
      if (note && !text.trim()) {
        setText(note)
      }
      clearError()
      setShowCameraCapture(false)
      setCapturing(null)
    },
    [addFiles, clearError, setCapturing, setShowCameraCapture, setText, text]
  )

  const handleCaptureAudio = useCallback(async () => {
    setCapturing('audio')
    clearError()
    try {
      const file = await captureAudio(MAX_AUDIO_CAPTURE_MS)
      if (file) {
        addFiles([file])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to record audio'
      setError(msg)
    } finally {
      setCapturing(null)
    }
  }, [addFiles, setCapturing, setError, clearError])

  const handleRetryUpload = useCallback(() => {
    void handleSubmit()
  }, [handleSubmit])

  if (!open) return null

  const sheetPanelStyle = sheetTranslateY > 0 ? { transform: `translateY(${sheetTranslateY}px)` } : undefined

  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Create post"
      data-testid="post-content-modal"
    >
      <Toast
        message={error}
        onClose={clearError}
        durationMs={busy ? 0 : ERROR_TOAST_MS}
        role="alert"
      />
      <Toast
        message={successToast}
        onClose={dismissToast}
        durationMs={0}
        role="status"
      />
      <div
        className="sheet__panel"
        ref={panelRef}
        style={sheetPanelStyle}
        onKeyDown={event => {
          if (showCameraCapture) return
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            if (!isSubmitDisabled) {
              void handleSubmit()
            }
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            void handleRequestClose()
          }
        }}
        onPointerDown={event => {
          if (showCameraCapture) return
          if (event.pointerType === 'mouse') return

          const target = event.target as HTMLElement
          if (target.closest('button, a, input, textarea, [role="button"]')) return

          const panel = panelRef.current
          if (!panel) return

          const scrollable = panel.querySelector('.modal__body') as HTMLElement | null
          if (scrollable && scrollable.scrollTop > 0) return

          dragStartYRef.current = event.clientY
          isDraggingRef.current = true
          dragTranslateYRef.current = 0
          panel.style.transition = 'none'
          event.preventDefault()
        }}
        onPointerMove={event => {
          if (!isDraggingRef.current) return
          const deltaY = event.clientY - dragStartYRef.current
          if (deltaY < 0) {
            setSheetTranslateY(0)
            dragTranslateYRef.current = 0
            return
          }
          setSheetTranslateY(deltaY)
          dragTranslateYRef.current = deltaY
          event.preventDefault()
        }}
        onPointerUp={() => {
          if (!isDraggingRef.current) return
          isDraggingRef.current = false
          const panel = panelRef.current
          if (panel) {
            panel.style.transition = ''
          }
          const threshold = 120
          if (dragTranslateYRef.current > threshold) {
            void handleRequestClose()
          }
          resetSheetDrag()
        }}
        onPointerCancel={() => {
          if (!isDraggingRef.current) return
          const panel = panelRef.current
          if (panel) {
            panel.style.transition = ''
          }
          resetSheetDrag()
        }}
        data-testid="post-content-panel"
      >
        <div className="sheet__content">
          <PostContentModalHeader />

          <PostContentModalSheet
            text={text}
            onTextChange={handleTextChange}
            onDetectMedia={handleDetectMedia}
            textInputRef={textInputRef}
            maxTextLength={MAX_TEXT_LENGTH}
            visibility={visibility}
            feedTarget={feedTarget}
            targetUserId={targetUserId}
            busy={busy}
            onVisibilityChange={handleVisibilityChange}
            onFeedTargetChange={setFeedTarget}
            onTargetUserIdChange={setTargetUserId}
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
            acceptedTypes={ACCEPTED_MEDIA_TYPES}
            onFilesSelected={handleFilesSelected}
          detectedCount={detected.length}
          showCameraCapture={showCameraCapture}
          onCloseCameraCapture={handleCloseCameraCapture}
          onVideoPost={handleVideoPost}
          onRequestClose={handleRequestClose}
        />

          {!showCameraCapture && (
            <PostContentModalActions
              busy={busy}
              isSubmitDisabled={isSubmitDisabled}
              onCancel={handleRequestClose}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </div>
    </div>
  )
}
