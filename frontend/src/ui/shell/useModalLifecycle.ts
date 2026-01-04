/**
 * Centralized modal lifecycle management
 * Handles focus, escape key, and keyboard shortcuts in a single place
 */
import { useCallback, useEffect, useRef } from 'react'

type Options = {
  open: boolean
  onClose: () => void
  initialFocusRef: React.RefObject<HTMLElement>
  panelRef: React.RefObject<HTMLElement>
  onSubmit?: () => void
  isSubmitDisabled?: boolean
}

export function useModalLifecycle({ open, onClose, initialFocusRef, panelRef, onSubmit, isSubmitDisabled }: Options) {
  const lastFocusedRef = useRef<HTMLElement | null>(null)
  const escapeHandlerRef = useRef<((event: KeyboardEvent) => void) | null>(null)

  // Focus management
  useEffect(() => {
    if (!open) return

    lastFocusedRef.current = document.activeElement as HTMLElement | null
    const focusTimer = window.setTimeout(() => {
      initialFocusRef.current?.focus()
    }, 0)

    return () => {
      window.clearTimeout(focusTimer)
      lastFocusedRef.current?.focus()
    }
  }, [open, initialFocusRef])

  // Escape key handling (scoped to this modal)
  useEffect(() => {
    if (!open) {
      if (escapeHandlerRef.current) {
        window.removeEventListener('keydown', escapeHandlerRef.current, true)
        escapeHandlerRef.current = null
      }
      return
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panelRef.current?.contains(document.activeElement)) {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }

    escapeHandlerRef.current = handler
    window.addEventListener('keydown', handler, true) // Use capture phase

    return () => {
      if (escapeHandlerRef.current) {
        window.removeEventListener('keydown', escapeHandlerRef.current, true)
        escapeHandlerRef.current = null
      }
    }
  }, [open, onClose, panelRef])

  // Focus trap and keyboard shortcuts
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Tab key - focus trap
      if (event.key === 'Tab') {
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
        )
        if (!focusable || focusable.length === 0) return

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
        return
      }

      // Cmd/Ctrl+Enter - submit
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        if (onSubmit && !isSubmitDisabled) {
          onSubmit()
        }
      }
    },
    [panelRef, onSubmit, isSubmitDisabled]
  )

  return { handleKeyDown }
}
