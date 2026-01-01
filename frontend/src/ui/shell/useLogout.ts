import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { emitAuthChange } from '../../core/auth/authEvents'
import { abortRefresh } from '../../api/authRefresh'

const DEBUG = Boolean(import.meta.env?.DEV)

export function useLogout() {
  const nav = useNavigate()

  const logout = useCallback(async () => {
    try {
      abortRefresh()
      await api.auth.logout()
    } catch (error) {
      if (DEBUG) {
        console.error('[logout] API call failed:', error)
      }
      // Continue with logout even if API call fails
      // The server may have already invalidated the session
    }

    // Clear auth state synchronously
    emitAuthChange()

    // Clear localStorage data
    try {
      localStorage.removeItem('internet-date:reactions')
      localStorage.removeItem('river.quiz.answers')
    } catch (error) {
      if (DEBUG) {
        console.warn('[logout] Failed to clear localStorage:', error)
      }
    }

    // Navigate immediately - no setTimeout needed
    // React state updates are synchronous, and emitAuthChange triggers immediate cleanup
    nav('/login', { replace: true })
  }, [nav])

  return { logout }
}
