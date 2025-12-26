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
        <div style={{ fontSize: 'var(--fs-4)', fontWeight: 650 }}>Profile media</div>

        <div className="u-row-between" style={{ gap: 12 }}>
          <div className="u-row" style={{ gap: 10 }}>
            <Avatar name="You" size="sm" src={avatarUrl ?? null} />
            <div>
              <div style={{ fontSize: 'var(--fs-3)', fontWeight: 600 }}>Avatar</div>
              <div className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>Shows in matches and inbox.</div>
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
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) handleUpload('avatar', file)
            }}
          />
        </div>

        <div className="u-row-between" style={{ gap: 12 }}>
          <div className="u-row" style={{ gap: 10 }}>
            <div className="mediaThumb" style={{ width: 72, height: 96 }}>
              {heroUrl ? <img src={heroUrl} alt="" loading="lazy" /> : null}
            </div>
            <div>
              <div style={{ fontSize: 'var(--fs-3)', fontWeight: 600 }}>Hero photo</div>
              <div className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>Used for the profile header.</div>
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
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) handleUpload('hero', file)
            }}
          />
        </div>

        <div className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>
          JPG, PNG, or WEBP. Max 10MB.
        </div>
        {error && (
          <div style={{ color: 'rgba(251,113,133,.9)', fontSize: 'var(--fs-2)' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
