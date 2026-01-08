import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../core/auth/useAuth';

type AdminLayoutProps = {
  children: ReactNode;
};

export function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation();
  const auth = useAuth();

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="admin-layout">
      <nav className="admin-navbar">
        <div className="admin-navbar-content">
          <div className="admin-navbar-brand">
            <Link to="/admin" className="admin-brand-link">
              Admin Panel
            </Link>
            {auth.isSuperAdmin && (
              <span className="admin-badge super-admin">Super Admin</span>
            )}
            {auth.isAdmin && !auth.isSuperAdmin && (
              <span className="admin-badge admin">Admin</span>
            )}
          </div>

          <div className="admin-navbar-links">
            <Link 
              to="/admin/jobs" 
              className={`admin-nav-link ${isActive('/admin/jobs') || location.pathname === '/admin' ? 'active' : ''}`}
            >
              Job Manager
            </Link>
          </div>
        </div>
      </nav>

      <div className="admin-content">
        {children}
      </div>
    </div>
  );
}
