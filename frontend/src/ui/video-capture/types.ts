export type CaptureMode = 'select' | 'record' | 'review' | 'posting'

export type CaptureDuration = 10 | 30 | 60

export type CaptureStatus =
  | { kind: 'idle' }
  | { kind: 'requesting-permission' }
  | { kind: 'ready' }
  | { kind: 'recording' }
  | { kind: 'stopping' }
  | { kind: 'error'; message: string }

export type RecordedMedia = {
  blob: Blob
  mimeType: string
  createdAt: number
}
