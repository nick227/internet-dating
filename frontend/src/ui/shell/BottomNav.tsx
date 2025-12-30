import { useLocation, useNavigate } from 'react-router-dom'
import { IconButton } from '../ui/IconButton'

type Props = {
  onPostClick: () => void
  onFollowersClick: () => void
}

export function BottomNav({ onPostClick, onFollowersClick }: Props) {
  const nav = useNavigate()
  const loc = useLocation()
  const is = (p: string) => loc.pathname.startsWith(p)

  return (
    <div className="bottomNav">
      <div className="bottomNav__rail">
        <IconButton active={is('/feed')} label="Home" onClick={() => nav('/feed')}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M3 11l9-8 9 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M5 10v10h5v-6h4v6h5V10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconButton>
        <IconButton active={is('/matches')} label="Likes" onClick={() => nav('/matches')}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M12 20s-7-4.3-7-9a4.5 4.5 0 0 1 7-3.8A4.5 4.5 0 0 1 19 11c0 4.7-7 9-7 9z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </IconButton>
        <IconButton label="Post" onClick={onPostClick} className="bottomNav__postBtn">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconButton>
        <IconButton active={is('/inbox')} label="Inbox" onClick={() => nav('/inbox')}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M4 6h16v12H4z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M4 7l8 6 8-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconButton>
        <IconButton label="Followers" onClick={onFollowersClick}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx="9"
              cy="7"
              r="4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconButton>
      </div>
    </div>
  )
}
