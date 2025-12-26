import { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useCurrentUser } from '../../core/auth/useCurrentUser'
import { useRealtime } from '../../core/ws/useRealtime'
import { IconButton } from '../ui/IconButton'
import { TopBar } from './TopBar'

export function AppShell({ children }: { children: ReactNode }) {
  const currentUser = useCurrentUser()
  const nav = useNavigate()
  const loc = useLocation()
  const is = (p: string) => loc.pathname.startsWith(p)
  const userId = currentUser.userId
  const displayName = currentUser.displayName
  useRealtime(userId, currentUser.loading)

  async function handleLogout() {
    try {
      await api.auth.logout()
    } finally {
      window.location.assign('/login')
    }
  }

  return (
    <div className="shell">
      <TopBar
        title="Internet Dating"
        displayName={displayName}
        isLoggedIn={Boolean(userId)}
        loading={currentUser.loading}
        onHome={() => nav('/feed')}
        onLogin={() => nav('/login?mode=login')}
        onSignup={() => nav('/login?mode=signup')}
        onLogout={handleLogout}
      />
      <div className="stage">
        {children}
        <div className="bottomNav">
          <div className="bottomNav__rail">
            <IconButton active={is('/feed')} label="Feed" onClick={() => nav('/feed')}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M3 11l9-8 9 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 10v10h5v-6h4v6h5V10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </IconButton>
            <IconButton active={is('/matches')} label="Matches" onClick={() => nav('/matches')}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d="M12 20s-7-4.3-7-9a4.5 4.5 0 0 1 7-3.8A4.5 4.5 0 0 1 19 11c0 4.7-7 9-7 9z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            </IconButton>
            <IconButton active={is('/quiz')} label="Quiz" onClick={() => nav('/quiz')}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M8 12l2.5 2.5L16 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </IconButton>
            <IconButton active={is('/inbox')} label="Inbox" onClick={() => nav('/inbox')}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M4 6h16v12H4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  )
}
