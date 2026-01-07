import { createContext, useContext, useCallback, useEffect, useState, useRef, ReactNode } from 'react'
import { api } from '../../api/client'
import { HttpError } from '../../api/http'
import { refreshToken } from '../../api/authRefresh'
import { useAsync } from '../hooks/useAsync'
import { subscribeAuthChange, emitAuthChange } from './authEvents'

const DEBUG = Boolean(import.meta.env?.DEV)

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) return error.name === 'AbortError'
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

type SessionData = { userId: string } | null
type SessionContextValue = {
  data: SessionData
  error: unknown
  loading: boolean
  refetch: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

function useSessionInternal() {
  const [version, setVersion] = useState(0)
  const refreshFailedRef = useRef(false) // Track if refresh has already failed
  
  const handleAuthChange = useCallback(() => {
    // Reset refresh failure flag when auth changes (e.g., after login)
    refreshFailedRef.current = false
    setVersion(value => value + 1)
  }, [])

  useEffect(() => {
    return subscribeAuthChange(handleAuthChange)
  }, [handleAuthChange])

  const fetchSession = useCallback(async (signal: AbortSignal) => {
    try {
      if (DEBUG) console.debug('[auth] session:me:start')
      const res = await api.auth.me(signal)
      if (!res) {
        if (DEBUG) console.debug('[auth] session:me:null-response')
        throw new Error('Session response is null')
      }
      if (DEBUG) console.debug('[auth] session:me:success', { userId: res.userId })
      // Reset refresh failure flag on success
      refreshFailedRef.current = false
      return res
    } catch (err) {
      if (isAbortError(err)) throw err
      if (err instanceof HttpError && err.status === 401) {
        // Prevent infinite loop: if refresh already failed, don't try again
        if (refreshFailedRef.current) {
          if (DEBUG) console.debug('[auth] session:refresh:already-failed, skipping retry')
          throw new Error('Session expired. Please login again.')
        }
        
        if (DEBUG) console.debug('[auth] session:me:401 refresh')
        try {
          await refreshToken(s => api.auth.refresh(s), signal)
          if (DEBUG) console.debug('[auth] session:refresh:success')
          const res = await api.auth.me(signal)
          if (!res) {
            if (DEBUG) console.debug('[auth] session:me:null-response-after-refresh')
            throw new Error('Session response is null after refresh')
          }
          if (DEBUG)
            console.debug('[auth] session:me:success-after-refresh', { userId: res.userId })
          // Reset flag on successful refresh
          refreshFailedRef.current = false
          return res
        } catch (refreshErr) {
          if (refreshErr instanceof HttpError && refreshErr.status === 401) {
            if (DEBUG) console.debug('[auth] session:refresh:401 expired')
            // Mark refresh as failed to prevent infinite retry loop
            refreshFailedRef.current = true
            // Don't emit auth change here - it causes infinite loop
            // The error will be handled by the component (e.g., redirect to login)
            throw new Error('Session expired. Please login again.')
          }
          throw refreshErr
        }
      }
      if (DEBUG) console.debug('[auth] session:me:error', err)
      throw err
    }
  }, [])

  const session = useAsync(fetchSession, [version])

  const refetch = useCallback(() => {
    setVersion(v => v + 1)
  }, [])

  return { ...session, refetch }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useSessionInternal()
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used within SessionProvider')
  }
  return context
}
