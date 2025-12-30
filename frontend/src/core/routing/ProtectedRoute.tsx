import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { RouteLoading } from '../../ui/routing/RouteLoading'

type ProtectedRouteProps = {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const auth = useAuth()
  const location = useLocation()

  // Wait for session to load
  if (auth.loading) {
    return <RouteLoading />
  }

  // If not authenticated, redirect to login
  if (!auth.isAuthenticated) {
    const redirectPath = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`
    return <Navigate to={redirectPath} replace />
  }

  // User is authenticated
  return <>{children}</>
}
