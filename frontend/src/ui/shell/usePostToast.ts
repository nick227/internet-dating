/**
 * Toast lifecycle management for post composer
 * Decouples toast timing from modal lifecycle
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { SUCCESS_TOAST_MS, SUCCESS_CLOSE_DELAY_MS } from './postComposerConstants'

type ToastState = {
  message: string | null
  type: 'error' | 'success'
}

export function usePostToast() {
  const [toast, setToast] = useState<ToastState>({ message: null, type: 'error' })
  const closeTimerRef = useRef<number | null>(null)

  const showError = useCallback((message: string | null) => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setToast({ message, type: 'error' })
  }, [])

  const showSuccess = useCallback(
    (message: string, onClose?: () => void) => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      setToast({ message, type: 'success' })

      // Auto-close success toast and trigger callback
      closeTimerRef.current = window.setTimeout(() => {
        setToast({ message: null, type: 'success' })
        closeTimerRef.current = null
        onClose?.()
      }, SUCCESS_TOAST_MS + SUCCESS_CLOSE_DELAY_MS)
    },
    []
  )

  const dismiss = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setToast({ message: null, type: toast.type })
  }, [toast.type])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
  }, [])

  return {
    errorToast: toast.type === 'error' ? toast.message : null,
    successToast: toast.type === 'success' ? toast.message : null,
    showError,
    showSuccess,
    dismiss,
  }
}
