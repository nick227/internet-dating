import type { ProfileResponse } from '../../api/types'
import { Pill } from '../ui/Pill'
import { prettyIntent } from '../../core/format/prettyIntent'
import { useCompatibilityLabel } from '../../core/profile/useCompatibilityLabel'
import { Avatar } from '../ui/Avatar'

type HeroContentProps = {
  profile?: ProfileResponse
  presenceLabel?: string | null
}

export function HeroContent({ profile, presenceLabel }: HeroContentProps) {
  const compatibilityLabel = useCompatibilityLabel(profile?.compatibility ?? null)
  return (
    <div className="profile__heroContent">
      <div className="u-stack">
        <div className="profile__heroNameRow">
          <Avatar name="You" size="sm" src={profile?.avatarUrl ?? null} profileId={String(profile?.userId)} />
          <h2 className="profile__heroName u-clamp-1">{profile?.name}</h2>
          {profile?.age && <span className="profile__heroAge">{profile.age}</span>}
        </div>
        <div className="riverCard__chips">
          {profile?.locationText && <Pill>{profile.locationText}</Pill>}
          {profile?.intent && <Pill>{prettyIntent(profile.intent)}</Pill>}
          {presenceLabel && <Pill>{presenceLabel}</Pill>}
          {compatibilityLabel && <Pill>{compatibilityLabel}</Pill>}
        </div>
      </div>
    </div>
  )
}
