import { ReactNode, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { RouteLoading } from '../../ui/routing/RouteLoading'

type PublicRouteProps = {
  children: ReactNode
  redirectTo?: string
}

const AUTH_TIMEOUT_MS = 10000 // 10 seconds max wait for auth check

export function PublicRoute({ children, redirectTo = '/feed' }: PublicRouteProps) {
  const auth = useAuth()
  const [timedOut, setTimedOut] = useState(false)

  // Timeout fallback: if auth takes too long, assume not authenticated
  useEffect(() => {
    if (!auth.loading) {
      setTimedOut(false)
      return
    }
    
    const timeoutId = setTimeout(() => {
      console.warn('[PublicRoute] Auth check timed out, assuming not authenticated')
      setTimedOut(true)
    }, AUTH_TIMEOUT_MS)
    
    return () => clearTimeout(timeoutId)
  }, [auth.loading])

  // Wait for session to load (with timeout)
  if (auth.loading && !timedOut) {
    return <RouteLoading />
  }

  // If authenticated (and not timed out), redirect
  if (auth.isAuthenticated && !timedOut) {
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}
