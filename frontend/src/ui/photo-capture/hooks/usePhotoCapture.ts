import { useCallback, useEffect, useRef, useState } from 'react'
import { useMediaStream } from '../../video-capture/hooks/useMediaStream'

type CaptureStatus =
  | { kind: 'idle' }
  | { kind: 'requesting-permission' }
  | { kind: 'ready' }
  | { kind: 'capturing' }
  | { kind: 'error'; message: string }

type Params = {
  onRequestClose?: () => void
}

function mapErrorToMessage(errorCode: string | null): string {
  switch (errorCode) {
    case 'PERMISSION_DENIED':
      return 'Camera permission denied. Please allow camera access in your browser settings.'
    case 'DEVICE_NOT_FOUND':
      return 'No camera found. Please connect a camera and try again.'
    case 'DEVICE_IN_USE':
      return 'Camera is in use by another application. Please close it and try again.'
    case 'CONSTRAINT_NOT_SATISFIED':
      return 'Camera does not support the required settings.'
    case 'FAILED_TO_START':
      return 'Failed to start camera. Please try again.'
    default:
      return 'Camera error occurred. Please try again.'
  }
}

export function usePhotoCapture(params: Params) {
  const { onRequestClose } = params
  const [status, setStatus] = useState<CaptureStatus>({ kind: 'idle' })
  const media = useMediaStream()
  const onRequestCloseRef = useRef(onRequestClose)
  const mediaStartRef = useRef(media.start)
  const mediaStopRef = useRef(media.stop)

  useEffect(() => {
    onRequestCloseRef.current = onRequestClose
  }, [onRequestClose])

  useEffect(() => {
    mediaStartRef.current = media.start
    mediaStopRef.current = media.stop
  }, [media.start, media.stop])

  const openCamera = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus({ kind: 'error', message: 'Camera not supported in this browser' })
      return
    }

    setStatus({ kind: 'requesting-permission' })
    const result = await mediaStartRef.current()
    if (!result.stream) {
      const errorMsg = mapErrorToMessage(result.error)
      setStatus({ kind: 'error', message: errorMsg })
      return
    }
    setStatus({ kind: 'ready' })
  }, [])

  const closeCamera = useCallback(() => {
    mediaStopRef.current()
    setStatus({ kind: 'idle' })
  }, [])

  useEffect(() => {
    void openCamera()
    return () => {
      closeCamera()
    }
  }, [openCamera, closeCamera])

  return {
    status,
    stream: media.stream,
    facingMode: media.facingMode,
    toggleFacing: media.toggleFacing,
    closeCamera,
  }
}
