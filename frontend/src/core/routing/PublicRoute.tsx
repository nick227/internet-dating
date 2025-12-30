import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { RouteLoading } from '../../ui/routing/RouteLoading'

type PublicRouteProps = {
  children: ReactNode
  redirectTo?: string
}

export function PublicRoute({ children, redirectTo = '/feed' }: PublicRouteProps) {
  const auth = useAuth()

  if (auth.loading) {
    return <RouteLoading />
  }

  if (auth.isAuthenticated) {
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}
