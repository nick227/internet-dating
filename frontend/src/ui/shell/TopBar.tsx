import { ReactNode } from 'react'
import { Avatar } from '../ui/Avatar'

type UserInfo = {
  displayName?: string | null
  avatarUrl?: string | null
  userId?: string | number | null
  isLoggedIn: boolean
  loading?: boolean
}

type TopBarProps = {
  title: string
  user: UserInfo
  onHome: () => void
  onLogin: () => void
  onSignup: () => void
  onLogout: () => void
  onUserClick?: () => void
}

export function TopBar({
  title,
  user,
  onHome,
  onLogin,
  onSignup,
  onLogout,
  onUserClick,
}: TopBarProps) {
  let actions: ReactNode
  if (user.loading) {
    actions = <span className="topBar__hint">Checking...</span>
  } else if (user.isLoggedIn) {
    actions = (
      <>
        <Avatar 
          name={user.displayName ?? 'Account'} 
          size="sm" 
          src={user.avatarUrl ?? null} 
          profileId={user.userId ? String(user.userId) : null}
          onClick={onUserClick}
          className="topBar__userAvatar"
        />
        <a
          className="topBar__link"
          onClick={onUserClick}
          aria-disabled={user.loading}
        >
          Profile
        </a> / 
        <a
          className="topBar__link"
          onClick={onLogout}
          aria-disabled={user.loading}
        >
          Logout
        </a>
      </>
    )
  } else {
    actions = (
      <>
        <button type="button" className="actionBtn" onClick={onLogin}>
          Login
        </button>
        <button type="button" className="actionBtn actionBtn--like" onClick={onSignup}>
          Register
        </button>
      </>
    )
  }

  return (
    <header className="topBar">
      <div className="topBar__inner">
          <h2 onClick={onHome} className="topBar__titleText">{title}</h2>
      </div>
      <div className="topBar__actions">{actions}</div>
    </header>
  )
}
