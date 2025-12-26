import type { MediaType, ProfileResponse } from '../../api/types'
import { Pill } from '../ui/Pill'
import { IconButton } from '../ui/IconButton'
import { prettyIntent } from '../../core/format/prettyIntent'
import { usePresence } from '../../core/ws/presence'
import { useNavigate } from 'react-router-dom'
type HeroSectionProps = {
  profile?: ProfileResponse
}

const HERO_SLOTS = [
  'heroMosaic__tile--a',
  'heroMosaic__tile--b',
  'heroMosaic__tile--c',
  'heroMosaic__tile--d',
  'heroMosaic__tile--e',
  'heroMosaic__tile--f'
] as const

type HeroMediaItem = {
  id: string
  type: MediaType
  src: string
  preview?: string | null
  alt: string
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)
}

function toMediaType(type: MediaType | undefined, url: string): MediaType {
  if (type) return type
  return isVideoUrl(url) ? 'VIDEO' : 'IMAGE'
}

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
      alt: `${name} hero`
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
      alt: `${name} ${label}`
    })
  }

  return items
}

export function HeroSection({ profile }: HeroSectionProps) {
  const nav = useNavigate()
  const presenceStatus = usePresence(profile?.userId)
  const presenceLabel =
    presenceStatus === 'online'
      ? 'Online now'
      : presenceStatus === 'away'
        ? 'Away'
        : presenceStatus === 'offline'
          ? 'Offline'
          : null
  const items = buildHeroItems(profile)
  const slots = HERO_SLOTS.map((slot, index) => {
    const item = items[index]
    if (!item) {
      return (
        <div
          key={`${slot}-empty`}
          className={`heroMosaic__tile heroMosaic__tile--empty ${slot}`}
          aria-hidden="true"
        />
      )
    }

    const isVideo = item.type === 'VIDEO'
    return (
      <div key={item.id} className={`heroMosaic__tile ${slot}`}>
        {isVideo ? (
          <video
            className="heroMosaic__media"
            src={item.src}
            poster={item.preview ?? undefined}
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img className="heroMosaic__media" src={item.preview ?? item.src} alt={item.alt} loading="lazy" />
        )}
        {isVideo && <div className="heroMosaic__badge">Video</div>}
      </div>
    )
  })

  return (
        <div className="profile__hero">
          <div className="profile__heroFallback" aria-hidden="true" />
          <div className="profile__heroMedia">{slots}</div>
          <div className="profile__heroScrim" />
          <div className="profile__topBar">
            <IconButton label="Back" onClick={() => nav(-1)}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </IconButton>
            <IconButton label="More" onClick={() => alert('TODO: menu')}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="5" cy="12" r="1.6" fill="currentColor" />
                <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                <circle cx="19" cy="12" r="1.6" fill="currentColor" />
              </svg>
            </IconButton>
          </div>
  
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
            <div className="u-stack">
              <div className="riverCard__name">
                <h2 className="u-clamp-1">{profile?.name}</h2>
                <span>{profile?.age ? String(profile.age) : ''}</span>
              </div>
              <div className="riverCard__chips">
                {profile?.locationText && <Pill>{profile.locationText}</Pill>}
                {profile?.intent && <Pill>{prettyIntent(profile.intent)}</Pill>}
                {presenceLabel && <Pill>{presenceLabel}</Pill>}
              </div>
            </div>
          </div>
        </div>
  )
}
