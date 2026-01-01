import { useMemo } from 'react'
import type { MediaType, ProfileResponse } from '../../api/types'
import { toMediaType } from '../media/mediaUtils'

export type HeroMediaItem = {
  id: string
  type: MediaType
  src: string
  preview?: string | null
  alt: string
  text?: string
  audioUrl?: string
  mediaId?: string | number
}

const HERO_SLOTS = [
  'heroMosaic__tile--a',
  'heroMosaic__tile--b',
  'heroMosaic__tile--c',
  'heroMosaic__tile--d',
  'heroMosaic__tile--e',
  'heroMosaic__tile--f',
  'heroMosaic__tile--g',
] as const

export type HeroSlot = (typeof HERO_SLOTS)[number]

export const HERO_SLOT_NAMES = HERO_SLOTS

function buildHeroItems(profile?: ProfileResponse): HeroMediaItem[] {
  if (!profile) return []
  const name = profile.name || 'Profile'
  const items: HeroMediaItem[] = []
  const seen = new Set<string>()

  const pushItem = (item: HeroMediaItem) => {
    if (!item.src || seen.has(item.src)) return
    seen.add(item.src)
    items.push(item)
  }

  if (profile.heroUrl) {
    const type = toMediaType(undefined, profile.heroUrl)
    pushItem({
      id: `hero-${profile.userId}`,
      type,
      src: profile.heroUrl,
      preview: profile.heroUrl,
      alt: `${name} hero`,
    })
  }

  for (const media of profile.media ?? []) {
    const src = media.url
    if (!src) continue
    const type = toMediaType(media.type, src)
    const label = type === 'VIDEO' ? 'Video' : 'Photo'
    pushItem({
      id: String(media.id),
      type,
      src,
      preview: media.thumbUrl ?? src,
      alt: `${name} ${label}`,
      mediaId: media.id,
    })
  }

  return items
}

export function useHeroItems(profile?: ProfileResponse): HeroMediaItem[] {
  return useMemo(() => buildHeroItems(profile), [profile])
}
