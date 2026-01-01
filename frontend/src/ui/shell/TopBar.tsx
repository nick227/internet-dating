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
  onQuizClick?: () => void
  onInterestsClick?: () => void
}

export function TopBar({
  title,
  user,
  onHome,
  onLogin,
  onSignup,
  onLogout,
  onQuizClick,
  onInterestsClick,
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
        <button
          type="button"
          className="topBar__link"
          onClick={onLogout}
          disabled={user.loading}
          aria-disabled={user.loading}
        >
          Logout
        </button>
      </>
    )
  } else {
    actions = (
      <>
        <button type="button" className="topBar__btn" onClick={onLogin}>
          Login
        </button>
        <button type="button" className="topBar__btn topBar__btn--primary" onClick={onSignup}>
          Register
        </button>
      </>
    )
  }

  return (
    <header className="topBar">
      <div className="topBar__inner">
        <button type="button" className="topBar__title" onClick={onHome}>
          {title}
        </button>
        <button type="button" className="topBar__title" onClick={onInterestsClick}>
          Interests
        </button>
        <button type="button" className="topBar__title" onClick={onQuizClick}>
          Quizzes
        </button>
        <div className="topBar__actions">{actions}</div>
      </div>
    </header>
  )
}
