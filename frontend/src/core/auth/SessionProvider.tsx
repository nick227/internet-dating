import { createContext, useContext, useCallback, useEffect, useState, useRef, ReactNode } from 'react'
import { api } from '../../api/client'
import { HttpError } from '../../api/http'
import { refreshToken } from '../../api/authRefresh'
import { useAsync } from '../hooks/useAsync'
import { subscribeAuthChange } from './authEvents'

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

type SessionData = { 
  userId: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
} | null

type SessionContextValue = {
  data: SessionData
  error: unknown
  loading: boolean
  refetch: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

// Module-level flag to prevent infinite refresh loops across all instances
let globalRefreshFailed = false
let globalRefreshFailedTimestamp = 0
const REFRESH_FAILURE_COOLDOWN_MS = 60000 // 1 minute cooldown before allowing retry

function useSessionInternal() {
  const [version, setVersion] = useState(0)
  const refreshFailedRef = useRef(false) // Track if refresh has already failed
  const lastAttemptRef = useRef(0) // Track last refresh attempt time
  
  const handleAuthChange = useCallback(() => {
    // Only reset if enough time has passed (prevent rapid resets)
    const now = Date.now()
    if (now - globalRefreshFailedTimestamp > REFRESH_FAILURE_COOLDOWN_MS) {
      refreshFailedRef.current = false
      globalRefreshFailed = false
      globalRefreshFailedTimestamp = 0
    }
    setVersion(value => value + 1)
  }, [])

  useEffect(() => {
    return subscribeAuthChange(handleAuthChange)
  }, [handleAuthChange])

  const fetchSession = useCallback(async (signal: AbortSignal) => {
    // Check global failure flag BEFORE making any requests
    const now = Date.now()
    const isInCooldown = globalRefreshFailed && (now - globalRefreshFailedTimestamp < REFRESH_FAILURE_COOLDOWN_MS)
    
    if (isInCooldown || refreshFailedRef.current) {
      if (DEBUG) console.debug('[auth] session:blocked - refresh failed recently, skipping', {
        global: globalRefreshFailed,
        local: refreshFailedRef.current,
        cooldown: REFRESH_FAILURE_COOLDOWN_MS,
        elapsed: now - globalRefreshFailedTimestamp
      })
      return null
    }

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
      globalRefreshFailed = false
      globalRefreshFailedTimestamp = 0
      return res
    } catch (err) {
      if (isAbortError(err)) throw err
      if (err instanceof HttpError && err.status === 401) {
        // Check cooldown again (it might have been set by another instance)
        const currentTime = Date.now()
        const stillInCooldown = globalRefreshFailed && (currentTime - globalRefreshFailedTimestamp < REFRESH_FAILURE_COOLDOWN_MS)
        
        // Prevent infinite loop: if refresh already failed (locally or globally), don't try again
        if (refreshFailedRef.current || stillInCooldown) {
          if (DEBUG) console.debug('[auth] session:refresh:already-failed, skipping retry', { 
            local: refreshFailedRef.current, 
            global: globalRefreshFailed,
            cooldown: stillInCooldown,
            elapsed: currentTime - globalRefreshFailedTimestamp
          })
          // Return null to indicate no session, but don't throw to prevent retry
          return null
        }
        
        if (DEBUG) console.debug('[auth] session:me:401 attempting refresh')
        lastAttemptRef.current = currentTime
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
          globalRefreshFailed = false
          globalRefreshFailedTimestamp = 0
          return res
        } catch (refreshErr) {
          if (refreshErr instanceof HttpError && refreshErr.status === 401) {
            if (DEBUG) console.debug('[auth] session:refresh:401 expired - marking as failed with cooldown')
            // Mark refresh as failed to prevent infinite retry loop (both local and global)
            // Use current time to ensure accurate cooldown
            const failureTime = Date.now()
            refreshFailedRef.current = true
            globalRefreshFailed = true
            globalRefreshFailedTimestamp = failureTime
            // Return null instead of throwing to prevent useAsync from retrying
            // The error will be handled by the component (e.g., redirect to login)
            return null
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
