import { useRef, useState } from 'react'
import { api } from '../../api/client'
import { SmartTextarea, type DetectedMedia } from '../form/SmartTextarea'

type Props = {
  onPosted?: () => void
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp'

export function PostComposer({ onPosted }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [detected, setDetected] = useState<DetectedMedia[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async () => {
    const body = text.trim()
    if (!body && files.length === 0) {
      setError('Add text or at least one photo.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const mediaIds: string[] = []
      for (const file of files) {
        const upload = await api.media.upload(file)
        mediaIds.push(String(upload.mediaId))
      }
      await api.posts.create({
        text: body ? body : null,
        visibility: 'PUBLIC',
        mediaIds: mediaIds.length ? mediaIds : undefined,
      })
      setText('')
      setFiles([])
      setDetected([])
      setMessage('Post published.')
      onPosted?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to publish post'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="u-glass profile__card">
      <div className="u-stack">
        <div className="profile__sectionTitle">New post</div>
        <SmartTextarea
          value={text}
          onChange={setText}
          placeholder="Share something with the feed..."
          maxLength={320}
          onDetectMedia={setDetected}
          replaceOnDetect={false}
        />
        <div className="u-row-between u-gap-3 u-wrap">
          <div className="u-row u-gap-3 u-wrap">
            <button
              className="topBar__btn"
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              Add photo
            </button>
            {files.length > 0 && (
              <button
                className="topBar__btn"
                type="button"
                onClick={() => setFiles([])}
                disabled={busy}
              >
                Clear ({files.length})
              </button>
            )}
            <span className="profile__meta">
              {files.length > 0
                ? `${files.length} file${files.length > 1 ? 's' : ''} selected`
                : 'No media selected'}
            </span>
          </div>
          <button
            className="actionBtn actionBtn--like profile__composerButton"
            type="button"
            onClick={handleSubmit}
            disabled={busy}
          >
            {busy ? 'Posting...' : 'Post'}
          </button>
        </div>
        <input
          ref={fileRef}
          className="srOnly"
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          onChange={event => {
            const list = Array.from(event.currentTarget.files ?? [])
            event.currentTarget.value = ''
            if (list.length) setFiles(list)
          }}
        />
        <div className="profile__meta">Uploads each photo before publishing the post.</div>
        {detected.length > 0 && (
          <div className="profile__meta">
            Detected {detected.length} link{detected.length > 1 ? 's' : ''}. Embeds coming soon.
          </div>
        )}
        {error && <div className="profile__error">{error}</div>}
        {message && <div className="profile__meta">{message}</div>}
      </div>
    </div>
  )
}
