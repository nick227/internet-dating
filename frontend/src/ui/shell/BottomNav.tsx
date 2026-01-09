import { useLocation, useNavigate } from 'react-router-dom'
import { IconButton } from '../ui/IconButton'

type Props = {
  onPostClick: () => void
}

export function BottomNav({ onPostClick }: Props) {
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
        <IconButton active={is('/connections')} label="Connections" onClick={() => nav('/connections/inbox')}>
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
        <IconButton active={is('/personality')} label="Personality" onClick={() => nav('/personality/quizzes')}>
          {/* Interest tags icon: three pills with small dots */}
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            {/* pill 1 */}
            <rect
              x="4"
              y="5"
              width="16"
              height="4"
              rx="2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle cx="7" cy="7" r="1" fill="currentColor" />

            {/* pill 2 */}
            <rect
              x="4"
              y="10"
              width="12"
              height="4"
              rx="2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle cx="7" cy="12" r="1" fill="currentColor" />

            {/* pill 3 */}
            <rect
              x="4"
              y="15"
              width="14"
              height="4"
              rx="2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle cx="7" cy="17" r="1" fill="currentColor" />
          </svg>
        </IconButton>

        <IconButton active={is('/profiles/search')} label="Search" onClick={() => nav('/profiles/search')}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <rect
              x="4"
              y="4"
              width="7"
              height="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <rect
              x="13"
              y="4"
              width="7"
              height="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <rect
              x="4"
              y="13"
              width="7"
              height="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <rect
              x="13"
              y="13"
              width="7"
              height="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx="7" cy="17" r="1" fill="currentColor" />
          </svg>
        </IconButton>
      </div>
    </div>
  )
}

