import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProfileMedia } from '../../api/types'
// import { SmartTextarea, type DetectedMedia } from '../form/SmartTextarea'
// import { fetchLinkPreview, type LinkPreview } from '../../core/media/linkPreview'
import { captureFromCamera } from '../../core/media/mediaCapture'
import { validateMediaFile } from '../../core/media/mediaValidation'
import { ACCEPTED_MEDIA_TYPES } from '../../core/media/mediaConstants'
// import { isVideoUrl } from '../../core/media/mediaUtils'

type HeroMediaPickerProps = {
  open: boolean
  existingMedia: ProfileMedia[]
  slotIndex?: number
  onClose: () => void
  onSelect: (mediaId: string | number) => Promise<void>
  onUpload: (file: File) => Promise<void>
  onUrlSubmit: (url: string) => Promise<void>
  onRemove?: () => Promise<void>
  hasExistingContent?: boolean
}

type PreviewItem = {
  id: string
  type: 'upload' | 'url' | 'library'
  src: string
  preview?: string
  label: string
  data?: File | string
  // linkPreview?: LinkPreview | null  // Disabled until URL tab is re-enabled
  loading?: boolean
}

// Use shared constants

// Slot labels for future use in UI
// const SLOT_LABELS: Record<number, string> = {
//   0: 'Hero Image',
//   1: 'Slot B',
//   2: 'Slot C',
//   3: 'Slot D',
//   4: 'Slot E',
//   5: 'Slot F',
//   6: 'Slot G',
// }

export function HeroMediaPicker({
  open,
  existingMedia,
  slotIndex: _slotIndex,
  onClose,
  onSelect,
  onUpload,
  onUrlSubmit: _onUrlSubmit,
  onRemove,
  hasExistingContent = false,
}: HeroMediaPickerProps) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState<'library' | 'upload'>('library')
  // URL and Text tabs disabled until backend support
  // const [urlText, setUrlText] = useState('')
  // const [textContent, setTextContent] = useState('')
  // const [detected, setDetected] = useState<DetectedMedia[]>([])
  // const [linkPreviews, setLinkPreviews] = useState<Map<string, LinkPreviewState>>(new Map())
  const [uploads, setUploads] = useState<PreviewItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)

  // type LinkPreviewState = {
  //   url: string
  //   preview: LinkPreview | null
  //   loading: boolean
  // }

  useEffect(() => {
    if (!open) {
      setActiveTab('library')
      // URL and Text tabs disabled
      // setUrlText('')
      // setTextContent('')
      // setDetected([])
      // setLinkPreviews(new Map())
      
      // Clean up object URLs to prevent memory leaks
      setUploads(prev => {
        prev.forEach(item => {
          if (item.type === 'upload' && item.src) {
            URL.revokeObjectURL(item.src)
          }
        })
        return []
      })
      setError(null)
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

  const handleFileSelect = useCallback(async (selectedFiles: File[]) => {
    // Only use the first file since we only support single file uploads currently
    const file = selectedFiles[0]
    if (!file) return
    
    setError(null)
    
    // Validate file with metadata extraction (duration, resolution, MIME)
    try {
      const validation = await validateMediaFile(file)
      if (!validation.valid) {
        setError(validation.error || 'File validation failed')
        // Reset file input to allow selecting the same file again
        if (fileRef.current) {
          fileRef.current.value = ''
        }
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed')
      if (fileRef.current) {
        fileRef.current.value = ''
      }
      return
    }
    
    // Clear existing uploads and set new one
    setUploads(prev => {
      // Clean up old object URLs
      prev.forEach(item => {
        if (item.type === 'upload' && item.src) {
          URL.revokeObjectURL(item.src)
        }
      })
      
      return [{
        id: `${Date.now()}-${Math.random()}`,
        type: 'upload',
        src: URL.createObjectURL(file),
        preview: URL.createObjectURL(file),
        label: file.name,
        data: file,
      }]
    })
  }, [])

  const handleRemoveUpload = useCallback((id: string) => {
    setUploads(prev => {
      const item = prev.find(u => u.id === id)
      if (item?.src && item.type === 'upload') {
        URL.revokeObjectURL(item.src)
      }
      return prev.filter(u => u.id !== id)
    })
  }, [])

  const handleCaptureCamera = useCallback(async () => {
    setCapturing(true)
    setError(null)
    try {
      const file = await captureFromCamera({ video: false })
      if (file) {
        await handleFileSelect([file])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to capture from camera'
      setError(msg)
    } finally {
      setCapturing(false)
    }
  }, [handleFileSelect])

  // URL preview fetching disabled until backend support
  // useEffect(() => {
  //   if (detected.length === 0) return
  //   detected.forEach(item => {
  //     if (linkPreviews.has(item.url)) return
  //     setLinkPreviews(prev => {
  //       const next = new Map(prev)
  //       next.set(item.url, { url: item.url, preview: null, loading: true })
  //       return next
  //     })
  //     fetchLinkPreview(item.url)
  //       .then(preview => {
  //         setLinkPreviews(prev => {
  //           const next = new Map(prev)
  //           next.set(item.url, { url: item.url, preview, loading: false })
  //           return next
  //         })
  //       })
  //       .catch(() => {
  //         setLinkPreviews(prev => {
  //           const next = new Map(prev)
  //           next.set(item.url, { url: item.url, preview: null, loading: false })
  //           return next
  //         })
  //       })
  //   })
  // }, [detected, linkPreviews])

  // const handleUrlSubmit = useCallback(async () => {
  //   if (!urlText.trim()) {
  //     setError('Enter a URL')
  //     return
  //   }
  //   setBusy(true)
  //   setError(null)
  //   try {
  //     const detectedItem = detected[0]
  //     if (!detectedItem) {
  //       setError('Invalid URL format')
  //       setBusy(false)
  //       return
  //     }
  //     await onUrlSubmit(urlText)
  //     onClose()
  //   } catch (err) {
  //     setError(err instanceof Error ? err.message : 'Failed to add URL')
  //     setBusy(false)
  //   }
  // }, [urlText, detected, onUrlSubmit, onClose])

  const handleUploadSubmit = useCallback(async () => {
    if (uploads.length === 0) {
      setError('Select a file to upload')
      return
    }
    const uploadItem = uploads[0]
    if (!uploadItem || uploadItem.type !== 'upload' || !(uploadItem.data instanceof File)) {
      setError('Please select a valid file')
      return
    }
    
    setBusy(true)
    setError(null)
    try {
      // Re-validate before upload (metadata may have changed)
      const validation = await validateMediaFile(uploadItem.data)
      if (!validation.valid) {
        setError(validation.error || 'File validation failed')
        setBusy(false)
        return
      }
      
      await onUpload(uploadItem.data)
      // Clean up object URL after successful upload
      if (uploadItem.src) {
        URL.revokeObjectURL(uploadItem.src)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }, [uploads, onUpload, onClose])

  const handleLibrarySelect = useCallback(
    async (mediaId: string | number) => {
      try {
        await onSelect(mediaId)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to select media')
      }
    },
    [onSelect, onClose]
  )

  const handleRemove = useCallback(
    async () => {
      if (!onRemove) return
      setBusy(true)
      setError(null)
      try {
        await onRemove()
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove media')
      } finally {
        setBusy(false)
      }
    },
    [onRemove, onClose]
  )

  if (!open) return null

  return (
    <div className="modal heroMediaPicker" role="dialog" aria-modal="true" aria-label="Choose media">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="heroMediaPicker__content">
        <div className="heroMediaPicker__header">
          <div>
            <h2>Choose Media</h2>
          </div>
          <div className="heroMediaPicker__headerActions">
            {hasExistingContent && onRemove && (
              <button
                type="button"
                className="heroMediaPicker__removeBtn"
                onClick={handleRemove}
                disabled={busy}
                aria-label="Remove media"
              >
                Remove
              </button>
            )}
            <button className="heroMediaPicker__close" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="heroMediaPicker__tabs">
          <button
            type="button"
            className={activeTab === 'library' ? 'active' : ''}
            onClick={() => setActiveTab('library')}
          >
            Library
          </button>
          <button 
            type="button"
            className={activeTab === 'upload' ? 'active' : ''} 
            onClick={() => setActiveTab('upload')}
          >
            Upload
          </button>
          {/* URL tab hidden until backend support is ready */}
          {/* <button 
            type="button"
            className={activeTab === 'url' ? 'active' : ''} 
            onClick={() => setActiveTab('url')}
          >
            URL
          </button> */}
          {/* Text tab hidden until backend support is ready */}
          {/* <button 
            type="button"
            className={activeTab === 'text' ? 'active' : ''} 
            onClick={() => setActiveTab('text')}
          >
            Text
          </button> */}
        </div>

        <div className="heroMediaPicker__body">
          {error && <div className="heroMediaPicker__error">{error}</div>}

          {activeTab === 'library' && (
            <div className="heroMediaPicker__library">
              {existingMedia.length === 0 ? (
                <div className="heroMediaPicker__empty">No media in your library</div>
              ) : (
                <div className="heroMediaPicker__grid">
                  {existingMedia.map(media => {
                    // Always use thumbnail first, fallback to full URL
                    const preview = media.thumbUrl ?? media.url
                    const isVideo = media.type === 'VIDEO'
                    return (
                      <button
                        key={String(media.id)}
                        className="heroMediaPicker__item"
                        onClick={() => handleLibrarySelect(media.id)}
                        type="button"
                        aria-label={isVideo ? `Select video: ${media.id}` : `Select image: ${media.id}`}
                      >
                        {isVideo ? (
                          <video
                            src={media.url}
                            poster={preview}
                            muted
                            playsInline
                            preload="metadata"
                            aria-hidden="true"
                          />
                        ) : (
                          <img
                            src={preview}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            onLoad={(e) => {
                              // Add loaded class for fade-in effect
                              e.currentTarget.classList.add('loaded')
                            }}
                          />
                        )}
                        {isVideo && <div className="heroMediaPicker__badge">Video</div>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="heroMediaPicker__upload">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_MEDIA_TYPES}
                style={{ display: 'none' }}
                onChange={e => {
                  const files = Array.from(e.target.files || [])
                  handleFileSelect(files)
                  // Reset input to allow selecting the same file again
                  e.target.value = ''
                }}
              />
              <div className="heroMediaPicker__uploadActions">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
                  Choose File
                </button>
                <button type="button" onClick={handleCaptureCamera} disabled={busy || capturing}>
                  {capturing ? 'Capturing...' : 'Camera'}
                </button>
              </div>
              {uploads.length > 0 && (
                <>
                  <div className="heroMediaPicker__previews">
                    {uploads.map(item => (
                      <div key={item.id} className="heroMediaPicker__previewItem">
                        <img src={item.preview ?? item.src} alt={item.label} />
                        <button
                          className="heroMediaPicker__remove"
                          onClick={() => handleRemoveUpload(item.id)}
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={handleUploadSubmit} disabled={busy}>
                    {busy ? 'Uploading...' : 'Upload'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* URL tab content hidden until backend support is ready */}
          {/* {activeTab === 'url' && (
            <div className="heroMediaPicker__url">
              <SmartTextarea
                value={urlText}
                onChange={setUrlText}
                placeholder="Paste image, video, or YouTube URL..."
                onDetectMedia={setDetected}
                maxLength={500}
              />
              {detected.length > 0 && (
                <div className="heroMediaPicker__urlPreviews">
                  {detected.map(item => {
                    const preview = linkPreviews.get(item.url)
                    return (
                      <div key={item.url} className="heroMediaPicker__urlPreview">
                        {preview?.loading ? (
                          <div>Loading preview...</div>
                        ) : preview?.preview?.image ? (
                          <img src={preview.preview.image} alt="" />
                        ) : (
                          <div>Preview unavailable</div>
                        )}
                        <div className="heroMediaPicker__urlInfo">
                          {preview?.preview?.title && <div>{preview.preview.title}</div>}
                          <div className="heroMediaPicker__urlText">{item.url}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <button type="button" onClick={handleUrlSubmit} disabled={busy || detected.length === 0}>
                {busy ? 'Adding...' : 'Add URL'}
              </button>
            </div>
          )} */}

          {/* Text tab content hidden until backend support is ready */}
          {/* {activeTab === 'text' && (
            <div className="heroMediaPicker__text">
              <SmartTextarea
                value={textContent}
                onChange={setTextContent}
                placeholder="Enter text content..."
                maxLength={500}
              />
              <button type="button" disabled={!textContent.trim()}>
                Add Text (Coming Soon)
              </button>
            </div>
          )} */}
        </div>
      </div>
    </div>
  )
}
