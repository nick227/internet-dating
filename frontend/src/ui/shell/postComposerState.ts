import type { DetectedMedia } from '../form/SmartTextarea'
import type { LinkPreview } from '../../core/media/linkPreview'

export type FileWithPreview = {
  file: File
  preview: string
  id: string
}

export type UploadProgress = {
  fileId: string
  progress: number
  status: 'pending' | 'uploading' | 'complete' | 'error'
  error?: string
}

export type DraftData = {
  text: string
  fileIds: string[]
  visibility: 'PUBLIC' | 'PRIVATE'
  tags: string[]
  timestamp: number
}

export type LinkPreviewState = {
  url: string
  preview: LinkPreview | null
  loading: boolean
}

// Legacy types kept for backward compatibility with old hooks
// TODO: Remove when old hooks are deleted
export type PostComposerState = {
  text: string
  files: FileWithPreview[]
  detected: DetectedMedia[]
  tags: string[]
  linkPreviews: Record<string, LinkPreviewState>
  busy: boolean
  error: string | null
  visibility: 'PUBLIC' | 'PRIVATE'
  uploadProgress: Record<string, UploadProgress>
  draftSaved: boolean
  capturing: 'camera' | 'audio' | null
}

export type PostComposerAction =
  | { type: 'setText'; value: string }
  | { type: 'setDetected'; value: DetectedMedia[] }
  | { type: 'setTags'; value: string[] }
  | { type: 'setVisibility'; value: 'PUBLIC' | 'PRIVATE' }
  | { type: 'setBusy'; value: boolean }
  | { type: 'setError'; value: string | null }
  | { type: 'setCapturing'; value: 'camera' | 'audio' | null }
  | { type: 'setDraftSaved'; value: boolean }
  | { type: 'addFiles'; value: FileWithPreview[] }
  | { type: 'setFiles'; value: FileWithPreview[] }
  | { type: 'removeFile'; value: string }
  | { type: 'setUploadProgress'; value: Record<string, UploadProgress> }
  | {
      type: 'updateUploadProgress'
      fileId: string
      patch: Partial<Omit<UploadProgress, 'fileId'>>
    }
  | { type: 'linkPreviewStart'; url: string }
  | { type: 'linkPreviewSuccess'; url: string; preview: LinkPreview | null }
  | { type: 'linkPreviewFailure'; url: string }
  | { type: 'restoreDraft'; value: DraftData }
  | { type: 'reset' }

export const initialPostComposerState: PostComposerState = {
  text: '',
  files: [],
  detected: [],
  tags: [],
  linkPreviews: {},
  busy: false,
  error: null,
  visibility: 'PUBLIC',
  uploadProgress: {},
  draftSaved: false,
  capturing: null,
}

export function postComposerReducer(
  state: PostComposerState,
  action: PostComposerAction
): PostComposerState {
  switch (action.type) {
    case 'setText':
      return { ...state, text: action.value }
    case 'setDetected':
      return { ...state, detected: action.value }
    case 'setTags':
      return { ...state, tags: action.value }
    case 'setVisibility':
      return { ...state, visibility: action.value }
    case 'setBusy':
      return { ...state, busy: action.value }
    case 'setError':
      return { ...state, error: action.value }
    case 'setCapturing':
      return { ...state, capturing: action.value }
    case 'setDraftSaved':
      return { ...state, draftSaved: action.value }
    case 'addFiles':
      return { ...state, files: [...state.files, ...action.value] }
    case 'setFiles':
      return { ...state, files: action.value }
    case 'removeFile': {
      const nextFiles = state.files.filter(file => file.id !== action.value)
      const { [action.value]: _removed, ...restProgress } = state.uploadProgress
      return { ...state, files: nextFiles, uploadProgress: restProgress }
    }
    case 'setUploadProgress':
      return { ...state, uploadProgress: action.value }
    case 'updateUploadProgress': {
      const current = state.uploadProgress[action.fileId]
      const base: UploadProgress = current ?? {
        fileId: action.fileId,
        progress: 0,
        status: 'pending',
      }
      return {
        ...state,
        uploadProgress: {
          ...state.uploadProgress,
          [action.fileId]: { ...base, ...action.patch },
        },
      }
    }
    case 'linkPreviewStart':
      return {
        ...state,
        linkPreviews: {
          ...state.linkPreviews,
          [action.url]: { url: action.url, preview: null, loading: true },
        },
      }
    case 'linkPreviewSuccess':
      return {
        ...state,
        linkPreviews: {
          ...state.linkPreviews,
          [action.url]: { url: action.url, preview: action.preview, loading: false },
        },
      }
    case 'linkPreviewFailure':
      return {
        ...state,
        linkPreviews: {
          ...state.linkPreviews,
          [action.url]: { url: action.url, preview: null, loading: false },
        },
      }
    case 'restoreDraft':
      return {
        ...state,
        text: action.value.text,
        visibility: action.value.visibility,
        tags: action.value.tags ?? [],
      }
    case 'reset':
      return { ...initialPostComposerState }
    default:
      return state
  }
}
