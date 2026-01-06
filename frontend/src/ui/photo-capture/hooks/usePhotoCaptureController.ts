import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePhotoCapture } from './usePhotoCapture'

type Params = {
  /**
   * Callback invoked when user posts photos.
   * Called once with all files and a single caption.
   * @param files - Array of File objects for all photos
   * @param note - Caption text (applies to all photos)
   * @returns void or Promise<void> for async operations
   */
  onPost?: (files: File[], note: string) => void | Promise<void>
  onRequestClose?: () => void
}

function createPhotoFile(blob: Blob, index: number): File {
  if (!blob || blob.size === 0) {
    throw new Error(`Invalid blob at index ${index}`)
  }
  
  const type = blob.type || 'image/jpeg'
  const ext = type.includes('png') ? 'png' : 'jpg'
  const timestamp = Date.now()
  const fileName = `photo-${timestamp}-${index}.${ext}`
  
  const file = new File([blob], fileName, { type })
  
  if (!file.name || file.name.length === 0) {
    throw new Error(`Failed to create file with valid name at index ${index}`)
  }
  
  return file
}

type Photo = {
  id: string
  blob: Blob
  url: string
}

export function usePhotoCaptureController(params: Params) {
  const { onPost, onRequestClose } = params
  const [photos, setPhotos] = useState<Photo[]>([])
  const [view, setView] = useState<'camera' | 'review'>('camera')
  const [isPosting, setIsPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const capture = usePhotoCapture({ onRequestClose })
  const onPostRef = useRef(onPost)

  useEffect(() => {
    onPostRef.current = onPost
  }, [onPost])

  const isCapturing = capture.status.kind === 'capturing'

  const addPhoto = useCallback((blob: Blob) => {
    if (isCapturing) return
    if (blob.size === 0) return

    const id = crypto.randomUUID()
    const url = URL.createObjectURL(blob)
    setPhotos((prev) => [...prev, { id, blob, url }])
  }, [isCapturing])

  const removePhoto = useCallback((index: number) => {
    setPhotos((prev) => {
      const removed = prev[index]
      if (removed) {
        URL.revokeObjectURL(removed.url)
      }
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  useEffect(() => {
    if (photos.length === 0 && view === 'review') {
      setView('camera')
    }
  }, [photos.length, view])

  const clearPhotos = useCallback(() => {
    setPhotos((prev) => {
      prev.forEach(photo => URL.revokeObjectURL(photo.url))
      return []
    })
  }, [])

  const goToReview = useCallback(() => {
    if (photos.length > 0) {
      setView('review')
    }
  }, [photos.length])

  const goToCamera = useCallback(() => {
    setView('camera')
  }, [])

  const handlePost = useCallback(
    async (note: string) => {
      if (photos.length === 0) return
      if (isPosting) return

      setPostError(null)
      setIsPosting(true)

      try {
        const snapshot = [...photos]
        const files = snapshot.map((photo, index) => {
          try {
            const file = createPhotoFile(photo.blob, index)
            if (!file || !file.name || file.name.length === 0) {
              throw new Error(`File at index ${index} has invalid name: ${file?.name ?? 'undefined'}`)
            }
            return file
          } catch (error) {
            throw new Error(`Failed to create file for photo ${index + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        })
        
        const trimmedNote = note.trim()

        if (!files || files.length === 0) {
          throw new Error('No files to post')
        }

        files.forEach((file, index) => {
          if (!file || !(file instanceof File)) {
            throw new Error(`File at index ${index} is not a valid File object`)
          }
          if (!file.name || typeof file.name !== 'string' || file.name.length === 0) {
            throw new Error(`File at index ${index} has invalid name: ${String(file.name)}`)
          }
        })

        if (onPostRef.current) {
          await onPostRef.current(files, trimmedNote)
        }

        clearPhotos()
        setView('camera')
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to post photos'
        setPostError(msg)
        console.error('Post error:', error)
      } finally {
        setIsPosting(false)
      }
    },
    [photos, isPosting, clearPhotos]
  )

  const handleDiscard = useCallback(() => {
    clearPhotos()
    setView('camera')
    capture.closeCamera()
  }, [clearPhotos, capture])

  const handleBack = useCallback(() => {
    if (view === 'review') {
      goToCamera()
      return
    }
    capture.closeCamera()
    onRequestClose?.()
  }, [view, goToCamera, capture, onRequestClose])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
      event.preventDefault()
      handleBack()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [handleBack])

  useEffect(() => {
    return () => {
      photos.forEach(photo => URL.revokeObjectURL(photo.url))
    }
  }, [photos])

  const photoBlobs = useMemo(() => photos.map(p => p.blob), [photos])
  const photoUrls = useMemo(() => photos.map(p => p.url), [photos])

  return {
    photos: photoBlobs,
    photoUrls,
    view,
    isPosting,
    isCapturing,
    postError,
    capture,
    addPhoto,
    removePhoto,
    clearPhotos,
    goToReview,
    goToCamera,
    handlePost,
    handleDiscard,
    handleBack,
  }
}
