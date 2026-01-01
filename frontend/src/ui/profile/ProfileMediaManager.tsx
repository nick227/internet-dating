import { useRef, useState } from 'react'
import { api } from '../../api/client'
import { Avatar } from '../ui/Avatar'
import { Media } from '../ui/Media'
import { useMediaUpload } from '../../core/media/useMediaUpload'
import { ACCEPTED_IMAGE_TYPES } from '../../core/media/mediaConstants'

type Props = {
  userId: string | number
  avatarUrl?: string | null
  heroUrl?: string | null
  onUpdated?: () => void
}

export function ProfileMediaManager({ userId, avatarUrl, heroUrl, onUpdated }: Props) {
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const heroInputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState<'avatar' | 'hero' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { uploadFile } = useMediaUpload()

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
      const result = await uploadFile(file)
      if (type === 'avatar') {
        await api.profileUpdate(userId, { avatarMediaId: result.mediaId })
      } else {
        await api.profileUpdate(userId, { heroMediaId: result.mediaId })
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
            <Avatar name="You" size="sm" src={avatarUrl ?? null} profileId={String(userId)} />
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
            accept={ACCEPTED_IMAGE_TYPES}
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
              {heroUrl ? <Media src={heroUrl} alt="" className="mediaThumb__media" /> : null}
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
            accept={ACCEPTED_IMAGE_TYPES}
            onChange={event => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) handleUpload('hero', file)
            }}
          />
        </div>

        <div className="profile__meta">JPG, PNG, or WEBP. Max 50MB. Validated for resolution and format.</div>
        {error && <div className="profile__error">{error}</div>}
      </div>
    </div>
  )
}
