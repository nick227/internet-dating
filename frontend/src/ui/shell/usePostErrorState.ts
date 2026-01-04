/**
 * Unified error state management
 * Single source of truth for all errors (form validation, network, submission)
 */
import { useCallback, useState } from 'react'

export function usePostErrorState() {
  const [error, setError] = useState<string | null>(null)

  const setErrorState = useCallback((error: string | null) => {
    setError(error)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    error,
    setError: setErrorState,
    clearError,
  }
}
