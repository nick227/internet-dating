import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { RouteLoading } from '../../ui/routing/RouteLoading';

type AdminRouteProps = {
  children: ReactNode;
};

/**
 * Protected route that requires admin privileges.
 * Uses role from session to avoid additional API calls.
 */
export function AdminRoute({ children }: AdminRouteProps) {
  const auth = useAuth();
  const location = useLocation();

  // Wait for session to load
  if (auth.loading) {
    return <RouteLoading />;
  }

  // If not authenticated, redirect to login
  if (!auth.isAuthenticated) {
    const redirectPath = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
    return <Navigate to={redirectPath} replace />;
  }

  // If not admin, redirect to home
  if (!auth.isAdmin) {
    return <Navigate to="/" replace />;
  }

  // User is authenticated and admin
  return <>{children}</>;
}
