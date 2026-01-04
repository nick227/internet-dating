import { useState, useEffect } from 'react'
import type { Id, ProfileResponse, DatingIntent, Gender } from '../../api/types'
// eslint-disable-next-line no-restricted-imports
import type { ApiProfilePatchBody } from '../../api/contracts'
import { api } from '../../api/client'

const intentOptions: { value: DatingIntent; label: string }[] = [
  { value: 'UNSPECIFIED', label: 'Unspecified' },
  { value: 'FRIENDS', label: 'Friends' },
  { value: 'CASUAL', label: 'Casual' },
  { value: 'LONG_TERM', label: 'Long term' },
  { value: 'MARRIAGE', label: 'Marriage' },
]

const genderOptions: { value: Gender; label: string }[] = [
  { value: 'UNSPECIFIED', label: 'Unspecified' },
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'NONBINARY', label: 'Nonbinary' },
  { value: 'OTHER', label: 'Other' },
]

const visibilityOptions = [
  { value: 'visible', label: 'Visible' },
  { value: 'hidden', label: 'Hidden' },
]

type Props = {
  userId: Id
  profile: ProfileResponse
  onSaveReady: (saveFn: () => Promise<void>, hasChanges: () => boolean) => void
}

export function ProfileInlineEditor({ userId, profile, onSaveReady }: Props) {
  const [formData, setFormData] = useState({
    displayName: profile.name ?? '',
    bio: profile.bio ?? '',
    locationText: profile.locationText ?? '',
    birthdate: toInputDate(profile.birthdate) ?? '',
    intent: profile.intent ?? 'UNSPECIFIED',
    gender: profile.gender ?? 'UNSPECIFIED',
    isVisible: profile.isVisible !== false,
  })

  // Reset form when profile changes (e.g., after cancel)
  useEffect(() => {
    setFormData({
      displayName: profile.name ?? '',
      bio: profile.bio ?? '',
      locationText: profile.locationText ?? '',
      birthdate: toInputDate(profile.birthdate) ?? '',
      intent: profile.intent ?? 'UNSPECIFIED',
      gender: profile.gender ?? 'UNSPECIFIED',
      isVisible: profile.isVisible !== false,
    })
  }, [profile])

  // Expose save function and hasChanges to parent
  useEffect(() => {
    const originalData = {
      displayName: profile.name ?? '',
      bio: profile.bio ?? '',
      locationText: profile.locationText ?? '',
      birthdate: toInputDate(profile.birthdate) ?? '',
      intent: profile.intent ?? 'UNSPECIFIED',
      gender: profile.gender ?? 'UNSPECIFIED',
      isVisible: profile.isVisible !== false,
    }
    
    // Capture current formData in closure to prevent stale closures
    const currentFormData = formData
    const currentOriginalData = originalData
    
    const stableSaveFn = async () => {
      console.log('[ProfileInlineEditor] Save function called', { userId, formData: currentFormData })
      const patch: ApiProfilePatchBody = {
        displayName: currentFormData.displayName || null,
        bio: currentFormData.bio || null,
        locationText: currentFormData.locationText || null,
        birthdate: currentFormData.birthdate && currentFormData.birthdate.length ? `${currentFormData.birthdate}T00:00:00.000Z` : null,
        intent: currentFormData.intent as DatingIntent,
        gender: currentFormData.gender as Gender,
        isVisible: currentFormData.isVisible,
      }
      console.log('[ProfileInlineEditor] Patch payload:', patch)
      const response = await api.profileUpdate(userId, patch)
      console.log('[ProfileInlineEditor] Save response:', response)
      return response
    }
    
    const stableHasChanges = () => {
      return JSON.stringify(currentFormData) !== JSON.stringify(currentOriginalData)
    }
    
    onSaveReady(stableSaveFn, stableHasChanges)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, profile, userId])

  return (
    <div className="u-glass profile__card">
      <div className="u-stack">
        <div className="profile__sectionTitle">Edit profile</div>

        <div className="inlineField">
          <div className="inlineField__labelRow">
            <div className="inlineField__label">Display name</div>
          </div>
          <input
            className="inlineField__input"
            type="text"
            value={formData.displayName}
            onChange={e => setFormData({ ...formData, displayName: e.target.value })}
            placeholder="Name"
          />
        </div>

        <div className="inlineField">
          <div className="inlineField__labelRow">
            <div className="inlineField__label">Bio</div>
          </div>
          <textarea
            className="inlineField__input"
            value={formData.bio}
            onChange={e => setFormData({ ...formData, bio: e.target.value })}
            placeholder="Share a few lines about you"
            maxLength={222240}
            rows={3}
            style={{ resize: 'vertical' }}
          />
          <div className="inlineField__hint">Keep it short and specific.</div>
        </div>

        <div className="inlineField__grid">
          <div className="inlineField">
            <div className="inlineField__labelRow">
              <div className="inlineField__label">Location</div>
            </div>
            <input
              className="inlineField__input"
              type="text"
              value={formData.locationText}
              onChange={e => setFormData({ ...formData, locationText: e.target.value })}
              placeholder="City, State"
            />
          </div>
          <div className="inlineField">
            <div className="inlineField__labelRow">
              <div className="inlineField__label">Birthdate</div>
            </div>
            <input
              className="inlineField__input"
              type="date"
              value={formData.birthdate}
              onChange={e => setFormData({ ...formData, birthdate: e.target.value })}
            />
          </div>
        </div>

        <div className="inlineField">
          <div className="inlineField__labelRow">
            <div className="inlineField__label">Intent</div>
          </div>
          <div className="inlineChips">
            {intentOptions.map(option => (
              <button
                key={option.value}
                type="button"
                className={`inlineChip${formData.intent === option.value ? ' inlineChip--active' : ''}`}
                aria-pressed={formData.intent === option.value}
                onClick={() => setFormData({ ...formData, intent: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="inlineField">
          <div className="inlineField__labelRow">
            <div className="inlineField__label">Gender</div>
          </div>
          <div className="inlineChips">
            {genderOptions.map(option => (
              <button
                key={option.value}
                type="button"
                className={`inlineChip${formData.gender === option.value ? ' inlineChip--active' : ''}`}
                aria-pressed={formData.gender === option.value}
                onClick={() => setFormData({ ...formData, gender: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="inlineField">
          <div className="inlineField__labelRow">
            <div className="inlineField__label">Visibility</div>
          </div>
          <div className="inlineChips">
            {visibilityOptions.map(option => (
              <button
                key={option.value}
                type="button"
                className={`inlineChip${(formData.isVisible ? 'visible' : 'hidden') === option.value ? ' inlineChip--active' : ''}`}
                aria-pressed={(formData.isVisible ? 'visible' : 'hidden') === option.value}
                onClick={() => setFormData({ ...formData, isVisible: option.value === 'visible' })}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="inlineField__hint">Hidden profiles won't show up in suggestions.</div>
        </div>
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
