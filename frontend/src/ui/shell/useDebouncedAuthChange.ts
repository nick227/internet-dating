import { useCallback, useRef } from 'react'
import { emitAuthChange } from '../../core/auth/authEvents'

/**
 * Debounces emitAuthChange calls to prevent excessive re-renders
 * when multiple updates happen rapidly (e.g., posting then updating profile).
 */
export function useDebouncedAuthChange(delayMs = 100) {
  const timeoutRef = useRef<number | null>(null)

  const triggerAuthChange = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = window.setTimeout(() => {
      emitAuthChange()
      timeoutRef.current = null
    }, delayMs)
  }, [delayMs])

  return { triggerAuthChange }
}
