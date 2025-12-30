import { useRef, useState } from 'react'
import { api } from '../../api/client'
import { Avatar } from '../ui/Avatar'

type Props = {
  userId: string | number
  avatarUrl?: string | null
  heroUrl?: string | null
  onUpdated?: () => void
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp'

export function ProfileMediaManager({ userId, avatarUrl, heroUrl, onUpdated }: Props) {
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const heroInputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState<'avatar' | 'hero' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePick = (type: 'avatar' | 'hero') => {
    if (type === 'avatar') {
      avatarInputRef.current?.click()
    } else {
      heroInputRef.current?.click()
    }
  }

  const handleUpload = async (type: 'avatar' | 'hero', file: File) => {
    setError(null)
    setBusy(type)
    try {
      const upload = await api.media.upload(file)
      if (type === 'avatar') {
        await api.profileUpdate(userId, { avatarMediaId: upload.mediaId })
      } else {
        await api.profileUpdate(userId, { heroMediaId: upload.mediaId })
      }
      onUpdated?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setError(message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="u-glass profile__card">
      <div className="u-stack">
        <div className="profile__sectionTitle">Profile media</div>

        <div className="u-row-between u-gap-3 u-wrap">
          <div className="u-row u-gap-3 u-wrap">
            <Avatar name="You" size="sm" src={avatarUrl ?? null} />
            <div className="u-stack u-gap-2">
              <div className="profile__itemTitle">Avatar</div>
              <div className="profile__meta">Shows in matches and inbox.</div>
            </div>
          </div>
          <button
            className="topBar__btn topBar__btn--primary"
            type="button"
            onClick={() => handlePick('avatar')}
            disabled={busy !== null}
          >
            {busy === 'avatar' ? 'Uploading...' : 'Upload'}
          </button>
          <input
            ref={avatarInputRef}
            className="srOnly"
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={event => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) handleUpload('avatar', file)
            }}
          />
        </div>

        <div className="u-row-between u-gap-3 u-wrap">
          <div className="u-row u-gap-3 u-wrap">
            <div className="mediaThumb profile__heroThumb">
              {heroUrl ? <img src={heroUrl} alt="" loading="lazy" /> : null}
            </div>
            <div className="u-stack u-gap-2">
              <div className="profile__itemTitle">Hero photo</div>
              <div className="profile__meta">Used for the profile header.</div>
            </div>
          </div>
          <button
            className="topBar__btn"
            type="button"
            onClick={() => handlePick('hero')}
            disabled={busy !== null}
          >
            {busy === 'hero' ? 'Uploading...' : 'Upload'}
          </button>
          <input
            ref={heroInputRef}
            className="srOnly"
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={event => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) handleUpload('hero', file)
            }}
          />
        </div>

        <div className="profile__meta">JPG, PNG, or WEBP. Max 10MB.</div>
        {error && <div className="profile__error">{error}</div>}
      </div>
    </div>
  )
}
