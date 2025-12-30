import { useCallback, useEffect, useState } from 'react'
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

export function useSession() {
  const [version, setVersion] = useState(0)
  const handleAuthChange = useCallback(() => {
    setVersion(value => value + 1)
  }, [])

  useEffect(() => {
    return subscribeAuthChange(handleAuthChange)
  }, [handleAuthChange])

  // Stabilize the async function with useCallback to prevent infinite loops
  const fetchSession = useCallback(async (signal: AbortSignal) => {
    try {
      if (DEBUG) console.debug('[auth] session:me:start')
      const res = await api.auth.me(signal)
      if (!res) {
        if (DEBUG) console.debug('[auth] session:me:null-response')
        throw new Error('Session response is null')
      }
      if (DEBUG) console.debug('[auth] session:me:success', { userId: res.userId })
      return res
    } catch (err) {
      if (isAbortError(err)) throw err
      if (err instanceof HttpError && err.status === 401) {
        if (DEBUG) console.debug('[auth] session:me:401 refresh')
        try {
          // Use centralized refresh queue to prevent concurrent refreshes
          await refreshToken(s => api.auth.refresh(s), signal)
          if (DEBUG) console.debug('[auth] session:refresh:success')
          // Retry original request after refresh
          const res = await api.auth.me(signal)
          if (!res) {
            if (DEBUG) console.debug('[auth] session:me:null-response-after-refresh')
            throw new Error('Session response is null after refresh')
          }
          if (DEBUG)
            console.debug('[auth] session:me:success-after-refresh', { userId: res.userId })
          return res
        } catch (refreshErr) {
          // Refresh token expired - session is dead
          if (refreshErr instanceof HttpError && refreshErr.status === 401) {
            if (DEBUG) console.debug('[auth] session:refresh:401 expired')
            // Clear auth state immediately - no retries, no stale data
            emitAuthChange()
            throw new Error('Session expired. Please login again.')
          }
          // Other refresh errors propagate
          throw refreshErr
        }
      }
      if (DEBUG) console.debug('[auth] session:me:error', err)
      throw err
    }
  }, [])

  // Use version directly instead of array to avoid reference issues
  // useAsync will handle the dependency comparison
  const session = useAsync(fetchSession, [version])

  // Expose refetch function
  const refetch = useCallback(() => {
    setVersion(v => v + 1)
  }, [])

  return { ...session, refetch }
}
