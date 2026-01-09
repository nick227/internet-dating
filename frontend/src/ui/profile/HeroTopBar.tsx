import { IconButton } from '../ui/IconButton'

type HeroTopBarProps = {
  onBack: () => void
  onMessage?: () => void
}

export function HeroTopBar({ onBack, onMessage }: HeroTopBarProps) {
  return (
    <div className="profile__topBar">
      <IconButton label="Back" onClick={onBack}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M15 6l-6 6 6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </IconButton>
      {onMessage && (
        <IconButton label="More" onClick={onMessage}>
          Message
        </IconButton>
      )}
    </div>
  )
}
