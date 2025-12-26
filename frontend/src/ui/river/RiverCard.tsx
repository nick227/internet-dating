import { useMemo } from 'react'
import type { FeedCard } from '../../api/types'
import { ActionBar } from '../actions/ActionBar'
import { prettyIntent } from '../../core/format/prettyIntent'
import { Pill } from '../ui/Pill'

export function RiverCard({
  card,
  onOpenProfile,
  onToast
}: {
  card: FeedCard
  onOpenProfile: (userId: string | number) => void
  onToast?: (message: string) => void
}) {
  const hero = card.heroUrl ?? null
  const title = useMemo(() => {
    if (card.kind === 'profile') return `${card.name}${card.age ? `, ${card.age}` : ''}`
    return card.name
  }, [card.age, card.kind, card.name])
  const description = card.kind === 'profile' ? card.blurb : card.text

  const handleOpen = () => onOpenProfile(card.userId)

  return (
    <article
      className="riverCard"
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleOpen()
        }
      }}
    >
      <div className="riverCard__media">
        {hero ? <img className="riverCard__img" src={hero} alt="" loading="lazy" /> : null}
      </div>
      <div className="riverCard__scrim" />

      <div className="riverCard__meta">
        <div className="u-stack">
          <div className="riverCard__name">
            <h2 className="u-clamp-1">{card.name}</h2>
            <span>{card.kind === 'profile' ? (card.age ?? '') : ''}</span>
          </div>

          <div className="riverCard__chips">
            {card.kind === 'profile' && card.locationText && <Pill>{card.locationText}</Pill>}
            {card.kind === 'profile' && card.intent && <Pill>{`Intent: ${prettyIntent(card.intent)}`}</Pill>}
            {card.kind === 'profile' && <Pill>Active now</Pill>}
            {card.kind === 'post' && <Pill>Post</Pill>}
            {card.kind === 'post' && card.createdAt && <Pill>{formatDate(card.createdAt)}</Pill>}
          </div>

          {description && (
            <div className="u-clamp-2" style={{ color: 'rgba(255,255,255,.84)', fontSize: 'var(--fs-3)', lineHeight: '1.28', textShadow: '0 8px 18px rgba(0,0,0,.55)' }}>
              {description}
            </div>
          )}

          <div className="riverCard__actions" onClick={(e) => e.stopPropagation()}>
            <ActionBar userId={card.userId} onToast={onToast} />
          </div>

          <div className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>Tap a card to open the profile. Actions stay in place.</div>
        </div>
      </div>

      <span className="srOnly">{title}</span>
    </article>
  )
}

function formatDate(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'recent'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
