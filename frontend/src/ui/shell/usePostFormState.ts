/**
 * Simplified state management for post composer using useState
 */
import { useCallback, useState } from 'react'
import type { DetectedMedia } from '../form/SmartTextarea'
import type { LinkPreview } from '../../core/media/linkPreview'
import type { FileWithPreview, LinkPreviewState } from './postComposerState'

export type FeedTarget = 'profile' | 'main' | 'both'

export type PostFormState = {
  text: string
  files: FileWithPreview[]
  detected: DetectedMedia[]
  tags: string[]
  linkPreviews: Record<string, LinkPreviewState>
  visibility: 'PUBLIC' | 'PRIVATE'
  feedTarget: FeedTarget
  targetUserId: string | null
  busy: boolean
  error: string | null
  capturing: 'camera' | 'audio' | null
  uploadProgress: Record<string, { fileId: string; progress: number; status: 'pending' | 'uploading' | 'complete' | 'error'; error?: string }>
}

const initialState: PostFormState = {
  text: '',
  files: [],
  detected: [],
  tags: [],
  linkPreviews: {},
  visibility: 'PUBLIC',
  feedTarget: 'both',
  targetUserId: null,
  busy: false,
  error: null,
  capturing: null,
  uploadProgress: {},
}

export function usePostFormState() {
  const [state, setState] = useState<PostFormState>(initialState)

  const setText = useCallback((text: string) => {
    setState(prev => ({ ...prev, text }))
  }, [])

  const setDetected = useCallback((detected: DetectedMedia[]) => {
    setState(prev => ({ ...prev, detected }))
  }, [])

  const setTags = useCallback((tags: string[]) => {
    setState(prev => ({ ...prev, tags }))
  }, [])

  const setVisibility = useCallback((visibility: 'PUBLIC' | 'PRIVATE') => {
    setState(prev => ({ ...prev, visibility }))
  }, [])

  const setFeedTarget = useCallback((feedTarget: FeedTarget) => {
    setState(prev => ({ ...prev, feedTarget }))
  }, [])

  const setTargetUserId = useCallback((targetUserId: string | null) => {
    setState(prev => ({ ...prev, targetUserId }))
  }, [])

  const setBusy = useCallback((busy: boolean) => {
    setState(prev => ({ ...prev, busy }))
  }, [])

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }))
  }, [])

  const setCapturing = useCallback((capturing: 'camera' | 'audio' | null) => {
    setState(prev => ({ ...prev, capturing }))
  }, [])

  const addFiles = useCallback((files: FileWithPreview[]) => {
    setState(prev => ({ ...prev, files: [...prev.files, ...files] }))
  }, [])

  const setFiles = useCallback((files: FileWithPreview[]) => {
    setState(prev => ({ ...prev, files }))
  }, [])

  const removeFile = useCallback((fileId: string) => {
    setState(prev => {
      const nextFiles = prev.files.filter(f => f.id !== fileId)
      const { [fileId]: _removed, ...restProgress } = prev.uploadProgress
      return { ...prev, files: nextFiles, uploadProgress: restProgress }
    })
  }, [])

  const setUploadProgress = useCallback((progress: Record<string, { fileId: string; progress: number; status: 'pending' | 'uploading' | 'complete' | 'error'; error?: string }>) => {
    setState(prev => ({ ...prev, uploadProgress: progress }))
  }, [])

  const updateUploadProgress = useCallback((fileId: string, patch: Partial<{ fileId: string; progress: number; status: 'pending' | 'uploading' | 'complete' | 'error'; error?: string }>) => {
    setState(prev => {
      const current = prev.uploadProgress[fileId]
      return {
        ...prev,
        uploadProgress: {
          ...prev.uploadProgress,
          [fileId]: { fileId, ...current, ...patch },
        },
      }
    })
  }, [])

  const setLinkPreview = useCallback((url: string, preview: LinkPreview | null, loading: boolean) => {
    setState(prev => ({
      ...prev,
      linkPreviews: {
        ...prev.linkPreviews,
        [url]: { url, preview, loading },
      },
    }))
  }, [])

  const reset = useCallback(() => {
    setState(initialState)
  }, [])

  return {
    state,
    setText,
    setDetected,
    setTags,
    setVisibility,
    setFeedTarget,
    setTargetUserId,
    setBusy,
    setError,
    setCapturing,
    addFiles,
    setFiles,
    removeFile,
    setUploadProgress,
    updateUploadProgress,
    setLinkPreview,
    reset,
  }
}
