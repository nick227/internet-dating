import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import type { FeedCard } from '../../api/types'
import { SmartTextarea, type DetectedMedia } from '../form/SmartTextarea'
import { TagInput } from '../form/TagInput'
import { captureFromCamera, captureAudio } from '../../core/media/mediaCapture'
import { fetchLinkPreview, type LinkPreview } from '../../core/media/linkPreview'
import { useOptimisticFeed } from '../../core/feed/useOptimisticFeed'

type Props = {
  open: boolean
  onClose: () => void
  onPosted?: () => void
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp'
const DRAFT_KEY = 'postContentModal:draft'

type FileWithPreview = {
  file: File
  preview: string
  id: string
}

type UploadProgress = {
  fileId: string
  progress: number
  status: 'pending' | 'uploading' | 'complete' | 'error'
  error?: string
}

type DraftData = {
  text: string
  fileIds: string[]
  visibility: 'PUBLIC' | 'PRIVATE'
  tags: string[]
  timestamp: number
}

type LinkPreviewState = {
  url: string
  preview: LinkPreview | null
  loading: boolean
}

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

export function PostContentModal({ open, onClose, onPosted }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const { createOptimisticPost } = useOptimisticFeed()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<FileWithPreview[]>([])
  const [detected, setDetected] = useState<DetectedMedia[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [linkPreviews, setLinkPreviews] = useState<Map<string, LinkPreviewState>>(new Map())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC')
  const [uploadProgress, setUploadProgress] = useState<Map<string, UploadProgress>>(new Map())
  const [draftSaved, setDraftSaved] = useState(false)
  const [capturing, setCapturing] = useState<'camera' | 'audio' | null>(null)
  const draftTimerRef = useRef<number | null>(null)

  // Load draft on open
  useEffect(() => {
    if (!open) return
    try {
      const draftJson = localStorage.getItem(DRAFT_KEY)
      if (draftJson) {
        const draft: DraftData = JSON.parse(draftJson)
        // Only restore if draft is recent (within 24 hours)
        const age = Date.now() - draft.timestamp
        if (age < 24 * 60 * 60 * 1000) {
          const shouldRestore = confirm('Resume your draft?')
          if (shouldRestore) {
            setText(draft.text)
            setVisibility(draft.visibility)
            setTags(draft.tags || [])
            // Note: File previews can't be restored from localStorage
          }
        } else {
          localStorage.removeItem(DRAFT_KEY)
        }
      }
    } catch {
      // Ignore draft load errors
    }
  }, [open])

  // Auto-save draft
  useEffect(() => {
    if (!open || (!text.trim() && files.length === 0)) {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current)
        draftTimerRef.current = null
      }
      return
    }

    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current)
    }

    draftTimerRef.current = window.setTimeout(() => {
      try {
        const draft: DraftData = {
          text,
          fileIds: files.map(f => f.id),
          visibility,
          tags,
          timestamp: Date.now(),
        }
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
        setDraftSaved(true)
        setTimeout(() => setDraftSaved(false), 2000)
      } catch {
        // Ignore draft save errors
      }
    }, 2000)

    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current)
      }
    }
  }, [open, text, files, visibility, tags])

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      setText('')
      setFiles([])
      setDetected([])
      setTags([])
      setLinkPreviews(new Map())
      setError(null)
      setUploadProgress(new Map())
      setVisibility('PUBLIC')
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current)
        draftTimerRef.current = null
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const createFilePreview = useCallback((file: File): FileWithPreview => {
    return {
      file,
      preview: URL.createObjectURL(file),
      id: `${Date.now()}-${Math.random()}`,
    }
  }, [])

  const handleFileSelect = useCallback(
    (selectedFiles: File[]) => {
      const newFiles = selectedFiles.map(createFilePreview)
      setFiles(prev => [...prev, ...newFiles])
    },
    [createFilePreview]
  )

  const handleRemoveFile = useCallback((id: string) => {
    setFiles(prev => {
      const file = prev.find(f => f.id === id)
      if (file) {
        URL.revokeObjectURL(file.preview)
      }
      return prev.filter(f => f.id !== id)
    })
  }, [])

  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    setFiles(prev => {
      const newFiles = [...prev]
      const [moved] = newFiles.splice(fromIndex, 1)
      newFiles.splice(toIndex, 0, moved)
      return newFiles
    })
  }, [])

  // Fetch link previews when URLs are detected
  useEffect(() => {
    if (detected.length === 0) return
    detected.forEach(item => {
      if (linkPreviews.has(item.url)) return
      setLinkPreviews(prev => {
        const next = new Map(prev)
        next.set(item.url, { url: item.url, preview: null, loading: true })
        return next
      })
      fetchLinkPreview(item.url)
        .then(preview => {
          setLinkPreviews(prev => {
            const next = new Map(prev)
            next.set(item.url, { url: item.url, preview, loading: false })
            return next
          })
        })
        .catch(() => {
          setLinkPreviews(prev => {
            const next = new Map(prev)
            next.set(item.url, { url: item.url, preview: null, loading: false })
            return next
          })
        })
    })
  }, [detected, linkPreviews])

  const handleCaptureCamera = useCallback(async () => {
    setCapturing('camera')
    setError(null)
    try {
      const file = await captureFromCamera({ video: false })
      if (file) {
        handleFileSelect([file])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to capture from camera'
      setError(msg)
    } finally {
      setCapturing(null)
    }
  }, [handleFileSelect])

  const handleCaptureAudio = useCallback(async () => {
    setCapturing('audio')
    setError(null)
    try {
      const file = await captureAudio(60000) // 60 second max
      if (file) {
        handleFileSelect([file])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to record audio'
      setError(msg)
    } finally {
      setCapturing(null)
    }
  }, [handleFileSelect])

  const handleSubmit = async () => {
    const body = text.trim()
    if (!body && files.length === 0) {
      setError('Add text or at least one photo.')
      return
    }
    setBusy(true)
    setError(null)
    setUploadProgress(new Map())

    let optimisticCard: FeedCard | null = null

    try {
      // Initialize upload progress
      const progressMap = new Map<string, UploadProgress>()
      files.forEach(f => {
        progressMap.set(f.id, { fileId: f.id, progress: 0, status: 'pending' })
      })
      setUploadProgress(progressMap)

      // Upload files in parallel with progress tracking
      const uploadPromises = files.map(async fileWithPreview => {
        const { file, id } = fileWithPreview
        setUploadProgress(prev => {
          const next = new Map(prev)
          next.set(id, { fileId: id, progress: 0, status: 'uploading' })
          return next
        })

        try {
          // Simulate progress (real implementation would use XMLHttpRequest with progress events)
          const upload = await api.media.upload(file)
          setUploadProgress(prev => {
            const next = new Map(prev)
            next.set(id, { fileId: id, progress: 100, status: 'complete' })
            return next
          })
          return { mediaId: upload.mediaId, fileId: id }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Upload failed'
          setUploadProgress(prev => {
            const next = new Map(prev)
            next.set(id, { fileId: id, progress: 0, status: 'error', error: errorMsg })
            return next
          })
          throw err
        }
      })

      const uploadResults = await Promise.allSettled(uploadPromises)
      const mediaIds: string[] = []
      const errors: string[] = []

      uploadResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          mediaIds.push(String(result.value.mediaId))
        } else {
          errors.push(`File ${index + 1}: ${result.reason?.message || 'Upload failed'}`)
        }
      })

      if (mediaIds.length === 0 && files.length > 0) {
        setError('All uploads failed. Please try again.')
        setBusy(false)
        return
      }

      if (errors.length > 0) {
        setError(`Some uploads failed: ${errors.join(', ')}`)
      }

      // Only create optimistic post for PUBLIC posts (before API call)
      if (visibility === 'PUBLIC') {
        optimisticCard = createOptimisticPost(
          body,
          files.map(f => ({ url: f.preview, thumbUrl: f.preview })),
          visibility
        )

        // Dispatch event for optimistic feed insert and scroll
        window.dispatchEvent(
          new CustomEvent('feed:optimistic-insert', {
            detail: { card: optimisticCard },
          })
        )
      }

      // Create post
      const postResult = await api.posts.create({
        text: body ? body : null,
        visibility,
        mediaIds: mediaIds.length ? mediaIds : undefined,
      })

      // For PUBLIC posts, trigger feed refresh to get the real post
      // The optimistic post will be replaced naturally when the feed loads
      if (optimisticCard && visibility === 'PUBLIC') {
        // Trigger feed refresh to get the real post
        window.dispatchEvent(
          new CustomEvent('feed:refresh', {
            detail: { removeOptimisticId: optimisticCard.id, newPostId: String(postResult.id) },
          })
        )
      }

      // Clear draft on success
      localStorage.removeItem(DRAFT_KEY)

      // Cleanup file previews
      files.forEach(f => URL.revokeObjectURL(f.preview))

      setText('')
      setFiles([])
      setDetected([])
      setTags([])
      setLinkPreviews(new Map())
      onPosted?.()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to publish post'
      setError(msg)

      // Remove optimistic post if backend fails
      if (optimisticCard) {
        window.dispatchEvent(
          new CustomEvent('feed:remove-optimistic', {
            detail: { optimisticId: optimisticCard.id, error: msg },
          })
        )
      }

      // Show error alert
      alert(`Failed to post: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const hasUploadErrors = Array.from(uploadProgress.values()).some(p => p.status === 'error')
  const allUploadsComplete =
    files.length > 0 &&
    Array.from(uploadProgress.values()).every(p => p.status === 'complete' || p.status === 'error')

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Create post">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__panel">
        <div className="modal__header">
          <div style={{ fontSize: 'var(--fs-5)', fontWeight: 700 }}>Create Post</div>
          <div className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>
            Posting to Feed
          </div>
        </div>

        <div className="modal__body">
          <SmartTextarea
            value={text}
            onChange={setText}
            placeholder="What's on your mind?"
            maxLength={320}
            onDetectMedia={setDetected}
            replaceOnDetect={false}
          />

          {/* Visibility Toggle */}
          <div className="u-row u-gap-3" style={{ alignItems: 'center' }}>
            <label style={{ fontSize: 'var(--fs-2)', color: 'var(--muted)' }}>Visibility:</label>
            <div className="u-row u-gap-2">
              <button
                className={`topBar__btn ${visibility === 'PUBLIC' ? 'topBar__btn--primary' : ''}`}
                type="button"
                onClick={() => setVisibility('PUBLIC')}
                disabled={busy}
              >
                Public
              </button>
              <button
                className={`topBar__btn ${visibility === 'PRIVATE' ? 'topBar__btn--primary' : ''}`}
                type="button"
                onClick={() => setVisibility('PRIVATE')}
                disabled={busy}
              >
                Private
              </button>
            </div>
            <span className="profile__meta" style={{ fontSize: 'var(--fs-1)' }}>
              {visibility === 'PUBLIC' ? 'Visible to everyone' : 'Only you'}
            </span>
          </div>

          {/* Media Preview */}
          {files.length > 0 && (
            <div className="u-stack" style={{ gap: 'var(--s-2)' }}>
              <div
                className="profile__postMedia u-hide-scroll"
                style={{ display: 'flex', gap: 'var(--s-2)' }}
              >
                {files.map((fileWithPreview, index) => {
                  const progress = uploadProgress.get(fileWithPreview.id)
                  const isUploading = progress?.status === 'uploading'
                  const isError = progress?.status === 'error'
                  return (
                    <div
                      key={fileWithPreview.id}
                      className="profile__postMediaThumb u-relative"
                      style={{ position: 'relative' }}
                    >
                      <img
                        src={fileWithPreview.preview}
                        alt={`Preview ${index + 1}`}
                        style={{
                          width: '120px',
                          height: '160px',
                          objectFit: 'cover',
                          borderRadius: 'var(--r-3)',
                        }}
                      />
                      {!busy && (
                        <button
                          className="mediaDeleteBtn"
                          type="button"
                          onClick={() => handleRemoveFile(fileWithPreview.id)}
                          aria-label="Remove media"
                        >
                          ×
                        </button>
                      )}
                      {index > 0 && !busy && (
                        <button
                          className="topBar__btn"
                          type="button"
                          onClick={() => handleReorder(index, index - 1)}
                          style={{
                            position: 'absolute',
                            left: '4px',
                            top: '4px',
                            padding: '4px 8px',
                            fontSize: 'var(--fs-1)',
                          }}
                          aria-label="Move left"
                        >
                          ←
                        </button>
                      )}
                      {index < files.length - 1 && !busy && (
                        <button
                          className="topBar__btn"
                          type="button"
                          onClick={() => handleReorder(index, index + 1)}
                          style={{
                            position: 'absolute',
                            right: '4px',
                            top: '4px',
                            padding: '4px 8px',
                            fontSize: 'var(--fs-1)',
                          }}
                          aria-label="Move right"
                        >
                          →
                        </button>
                      )}
                      {isUploading && progress && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: 'rgba(0,0,0,0.7)',
                            padding: '4px',
                            fontSize: 'var(--fs-1)',
                          }}
                        >
                          Uploading... {Math.round(progress.progress)}%
                        </div>
                      )}
                      {isError && progress?.error && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: 'rgba(251,113,133,0.9)',
                            padding: '4px',
                            fontSize: 'var(--fs-1)',
                            color: 'white',
                          }}
                        >
                          Error: {progress.error}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Subject/Interest Tags */}
          <div className="u-stack" style={{ gap: 'var(--s-2)' }}>
            <label style={{ fontSize: 'var(--fs-2)', color: 'var(--muted)' }}>
              Tags (optional):
            </label>
            <TagInput
              value={tags}
              onChange={setTags}
              placeholder="Add tags..."
              maxTags={5}
              suggestions={TAG_SUGGESTIONS}
            />
          </div>

          {/* Link Previews */}
          {Array.from(linkPreviews.values()).map(state => {
            if (!state.preview) return null
            return (
              <div
                key={state.url}
                className="u-glass"
                style={{ padding: 'var(--s-3)', borderRadius: 'var(--r-3)' }}
              >
                {state.preview.type === 'youtube' && state.preview.image && (
                  <div className="u-stack" style={{ gap: 'var(--s-2)' }}>
                    <img
                      src={state.preview.image}
                      alt="YouTube thumbnail"
                      style={{ width: '100%', borderRadius: 'var(--r-2)' }}
                    />
                    <div>
                      <div style={{ fontSize: 'var(--fs-3)', fontWeight: 600 }}>
                        {state.preview.title}
                      </div>
                      <div className="profile__meta" style={{ fontSize: 'var(--fs-2)' }}>
                        {state.preview.siteName}
                      </div>
                    </div>
                  </div>
                )}
                {state.preview.type === 'image' && state.preview.image && (
                  <img
                    src={state.preview.image}
                    alt="Link preview"
                    style={{ width: '100%', borderRadius: 'var(--r-2)' }}
                  />
                )}
                {state.preview.type === 'website' && (
                  <div className="u-stack" style={{ gap: 'var(--s-1)' }}>
                    {state.preview.title && (
                      <div style={{ fontSize: 'var(--fs-3)', fontWeight: 600 }}>
                        {state.preview.title}
                      </div>
                    )}
                    {state.preview.description && (
                      <div className="profile__meta" style={{ fontSize: 'var(--fs-2)' }}>
                        {state.preview.description}
                      </div>
                    )}
                    {state.preview.siteName && (
                      <div className="profile__meta" style={{ fontSize: 'var(--fs-1)' }}>
                        {state.preview.siteName}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Media Upload Controls */}
          <div className="u-row u-gap-3 u-wrap">
            <button
              className="topBar__btn"
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy || capturing !== null}
            >
              📁 Choose from Library
            </button>
            <button
              className="topBar__btn"
              type="button"
              onClick={handleCaptureCamera}
              disabled={busy || capturing !== null}
            >
              {capturing === 'camera' ? 'Capturing...' : '📷 Take Photo'}
            </button>
            <button
              className="topBar__btn"
              type="button"
              onClick={handleCaptureAudio}
              disabled={busy || capturing !== null}
            >
              {capturing === 'audio' ? 'Recording...' : '🎤 Record Audio'}
            </button>
            {files.length > 0 && (
              <button
                className="topBar__btn"
                type="button"
                onClick={() => {
                  files.forEach(f => URL.revokeObjectURL(f.preview))
                  setFiles([])
                }}
                disabled={busy}
              >
                Clear all ({files.length})
              </button>
            )}
            {hasUploadErrors && (
              <button
                className="topBar__btn"
                type="button"
                onClick={() => {
                  // Retry failed uploads - would need to re-upload
                  setError('Retry not yet implemented. Please remove failed files and try again.')
                }}
                disabled={busy}
              >
                Retry failed
              </button>
            )}
          </div>

          {detected.length > 0 && (
            <div className="profile__meta" style={{ fontSize: 'var(--fs-2)' }}>
              Detected {detected.length} link{detected.length > 1 ? 's' : ''}. Embeds coming soon.
            </div>
          )}

          {draftSaved && (
            <div
              className="profile__meta"
              style={{ fontSize: 'var(--fs-2)', color: 'rgba(34,197,94,0.9)' }}
            >
              Draft saved
            </div>
          )}

          {error && (
            <div className="profile__error" style={{ fontSize: 'var(--fs-2)' }}>
              {error}
            </div>
          )}

          <input
            ref={fileRef}
            className="srOnly"
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            onChange={event => {
              const list = Array.from(event.currentTarget.files ?? [])
              event.currentTarget.value = ''
              if (list.length) handleFileSelect(list)
            }}
          />
        </div>

        <div className="modal__actions">
          <button
            className="actionBtn actionBtn--nope"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="actionBtn actionBtn--like"
            type="button"
            onClick={handleSubmit}
            disabled={
              busy ||
              (allUploadsComplete &&
                hasUploadErrors &&
                files.length > 0 &&
                Array.from(uploadProgress.values()).filter(p => p.status === 'complete').length ===
                  0)
            }
          >
            {busy ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}
