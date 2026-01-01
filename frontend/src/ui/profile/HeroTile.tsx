import type { HeroMediaItem, HeroSlot } from '../../core/profile/useHeroItems'
import { Media } from '../ui/Media'

type HeroTileProps = {
  slot: HeroSlot
  item?: HeroMediaItem
  onClick?: () => void
}

export function HeroTile({ slot, item, onClick }: HeroTileProps) {
  const isVideo = item?.type === 'VIDEO'

  if (!item) {
    if (!onClick) {
      return (
        <div
          className={`heroMosaic__tile heroMosaic__tile--empty ${slot}`}
          style={{ position: 'relative', zIndex: 1 }}
        />
      )
    }
    return (
      <div
        className={`heroMosaic__tile heroMosaic__tile--empty ${slot}`}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            onClick()
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Empty tile"
        style={{ cursor: 'pointer', position: 'relative', zIndex: 2 }}
      />
    )
  }

  const handleClick = () => {
    onClick?.()
  }

  return (
    <div
      key={item.id}
      className={`heroMosaic__tile ${slot}${onClick ? ' heroMosaic__tile--interactive' : ''}`}
      style={{ position: 'relative', zIndex: 2 }}
    >
      <Media
        src={item.preview ?? item.src}
        alt={item.alt}
        type={isVideo ? 'video' : 'image'}
        poster={isVideo ? (item.preview ?? undefined) : undefined}
        className="heroMosaic__media"
        onClick={handleClick}
      />
      {isVideo && <div className="heroMosaic__badge">Video</div>}
    </div>
  )
}
