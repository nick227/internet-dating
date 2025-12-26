import type { Id, ProfileResponse, DatingIntent, Gender } from '../../api/types'
import type { ApiProfilePatchBody } from '../../api/contracts'
import { api } from '../../api/client'
import { InlineField } from '../form/InlineField'
import { InlineChoiceChips } from '../form/InlineChoiceChips'
import { InlineTextarea } from '../form/InlineTextarea'

const intentOptions: { value: DatingIntent; label: string }[] = [
  { value: 'UNSPECIFIED', label: 'Unspecified' },
  { value: 'FRIENDS', label: 'Friends' },
  { value: 'CASUAL', label: 'Casual' },
  { value: 'LONG_TERM', label: 'Long term' },
  { value: 'MARRIAGE', label: 'Marriage' }
]

const genderOptions: { value: Gender; label: string }[] = [
  { value: 'UNSPECIFIED', label: 'Unspecified' },
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'NONBINARY', label: 'Nonbinary' },
  { value: 'OTHER', label: 'Other' }
]

const visibilityOptions = [
  { value: 'visible', label: 'Visible' },
  { value: 'hidden', label: 'Hidden' }
]

type Props = {
  userId: Id
  profile: ProfileResponse
  onProfileChange: (patch: Partial<ProfileResponse>) => void
}

export function ProfileInlineEditor({ userId, profile, onProfileChange }: Props) {
  const savePatch = async (patch: ApiProfilePatchBody) => {
    await api.profileUpdate(userId, patch)
  }

  return (
    <div className="u-glass profile__card">
      <div className="u-stack">
        <div style={{ fontSize: 'var(--fs-4)', fontWeight: 650 }}>Edit profile</div>

        <InlineField
          label="Display name"
          value={profile.name}
          placeholder="Name"
          onSave={async (value) => {
            await savePatch({ displayName: value })
            onProfileChange({ name: value ?? '' })
          }}
        />

        <InlineTextarea
          label="Bio"
          value={profile.bio ?? ''}
          placeholder="Share a few lines about you"
          maxLength={240}
          helper="Keep it short and specific."
          onSave={async (value) => {
            await savePatch({ bio: value })
            onProfileChange({ bio: value ?? undefined })
          }}
        />

        <div className="inlineField__grid">
          <InlineField
            label="Location"
            value={profile.locationText ?? ''}
            placeholder="City, State"
            onSave={async (value) => {
              await savePatch({ locationText: value })
              onProfileChange({ locationText: value ?? undefined })
            }}
          />
          <InlineField
            label="Birthdate"
            value={toInputDate(profile.birthdate) ?? ''}
            type="date"
            onSave={async (value) => {
              const next = value && value.length ? value : null
              await savePatch({ birthdate: next })
              onProfileChange({ birthdate: next ?? undefined })
            }}
          />
        </div>

        <InlineChoiceChips
          label="Intent"
          value={profile.intent ?? 'UNSPECIFIED'}
          options={intentOptions}
          onSave={async (value) => {
            await savePatch({ intent: value })
            onProfileChange({ intent: value ?? 'UNSPECIFIED' })
          }}
        />

        <InlineChoiceChips
          label="Gender"
          value={profile.gender ?? 'UNSPECIFIED'}
          options={genderOptions}
          onSave={async (value) => {
            await savePatch({ gender: value })
            onProfileChange({ gender: value ?? 'UNSPECIFIED' })
          }}
        />

        <InlineChoiceChips
          label="Visibility"
          value={profile.isVisible === false ? 'hidden' : 'visible'}
          options={visibilityOptions}
          onSave={async (value) => {
            const isVisible = value !== 'hidden'
            await savePatch({ isVisible })
            onProfileChange({ isVisible })
          }}
          helper="Hidden profiles won't show up in suggestions."
        />
      </div>
    </div>
  )
}

function toInputDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
