import type { HeroMediaItem } from '../../core/profile/useHeroItems'
import { HERO_SLOT_NAMES } from '../../core/profile/useHeroItems'
import { HeroTile } from './HeroTile'

type HeroMosaicProps = {
  items: HeroMediaItem[]
  onTileClick?: (item: HeroMediaItem, index: number) => void
  onEmptyClick?: (slotIndex: number) => void
}

export function HeroMosaic({ items, onTileClick, onEmptyClick }: HeroMosaicProps) {
  return (
    <>
      {HERO_SLOT_NAMES.map((slot, index) => {
        const item = items[index]
        const handleClick = item && onTileClick 
          ? () => onTileClick(item, index)
          : !item && onEmptyClick 
            ? () => onEmptyClick(index)
            : undefined
        return <HeroTile key={item?.id ?? `${slot}-empty`} slot={slot} item={item} onClick={handleClick} />
      })}
    </>
  )
}
