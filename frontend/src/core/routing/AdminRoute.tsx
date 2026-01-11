import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { RouteLoading } from '../../ui/routing/RouteLoading';

type AdminRouteProps = {
  children: ReactNode;
};

const AUTH_TIMEOUT_MS = 10000; // 10 seconds max wait for auth check

/**
 * Protected route that requires admin privileges.
 * Uses role from session to avoid additional API calls.
 */
export function AdminRoute({ children }: AdminRouteProps) {
  const auth = useAuth();
  const location = useLocation();
  const [timedOut, setTimedOut] = useState(false);

  // Timeout fallback: if auth takes too long, redirect to login
  useEffect(() => {
    if (!auth.loading) {
      setTimedOut(false);
      return;
    }
    
    const timeoutId = setTimeout(() => {
      console.warn('[AdminRoute] Auth check timed out, redirecting to login');
      setTimedOut(true);
    }, AUTH_TIMEOUT_MS);
    
    return () => clearTimeout(timeoutId);
  }, [auth.loading]);

  // Wait for session to load (with timeout)
  if (auth.loading && !timedOut) {
    return <RouteLoading />;
  }

  // If not authenticated or timed out, redirect to login
  if (!auth.isAuthenticated || timedOut) {
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
