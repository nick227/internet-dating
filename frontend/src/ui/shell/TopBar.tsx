import { ReactNode } from 'react'

type TopBarProps = {
  title: string
  displayName?: string | null
  isLoggedIn: boolean
  loading?: boolean
  onHome: () => void
  onLogin: () => void
  onSignup: () => void
  onLogout: () => void
}

export function TopBar({
  title,
  displayName,
  isLoggedIn,
  loading,
  onHome,
  onLogin,
  onSignup,
  onLogout
}: TopBarProps) {
  let actions: ReactNode
  if (loading) {
    actions = <span className="topBar__hint">Checking...</span>
  } else if (isLoggedIn) {
    actions = (
      <>
        <span className="topBar__user">{displayName ?? 'Account'}</span>
        <button type="button" className="topBar__link" onClick={onLogout}>
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
        <div className="topBar__actions">{actions}</div>
      </div>
    </header>
  )
}
