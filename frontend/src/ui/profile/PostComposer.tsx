import { useRef, useState } from 'react'
import { api } from '../../api/client'
import { SmartTextarea, type DetectedMedia } from '../form/SmartTextarea'
import { useMediaUpload } from '../../core/media/useMediaUpload'
import { ACCEPTED_MEDIA_TYPES } from '../../core/media/mediaConstants'

type Props = {
  onPosted?: () => void
  targetProfileUserId?: string | number | null
}

export function PostComposer({ onPosted, targetProfileUserId }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [detected, setDetected] = useState<DetectedMedia[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const { uploadFiles, abortAll } = useMediaUpload()

  const handleSubmit = async () => {
    const body = text.trim()
    if (!body && files.length === 0) {
      setError('Add text or at least one media file.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    setUploadProgress({})
    try {
      // Upload all files with validation and progress tracking
      const fileProgressMap: Record<string, number> = {}
      files.forEach((file, index) => {
        fileProgressMap[`file-${index}`] = 0
      })
      setUploadProgress(fileProgressMap)

      const { results, errors } = await uploadFiles(files, {
        onProgress: (progress, fileIndex?) => {
          if (fileIndex !== undefined) {
            setUploadProgress(prev => ({
              ...prev,
              [`file-${fileIndex}`]: progress.percent,
            }))
          }
        },
      })
      
      if (errors.length > 0) {
        const errorMessages = errors.map(e => e.error).join(', ')
        setError(`Upload failed: ${errorMessages}`)
        setBusy(false)
        return
      }

      if (results.length === 0 && !body) {
        setError('Add text or at least one media file.')
        setBusy(false)
        return
      }

      const mediaIds = results.map(r => r.mediaId)
      await api.posts.create({
        text: body ? body : null,
        visibility: 'PUBLIC',
        mediaIds: mediaIds.length ? mediaIds : undefined,
        targetUserId: targetProfileUserId ? String(targetProfileUserId) : undefined,
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
        <SmartTextarea
          value={text}
          onChange={setText}
          placeholder=""
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
              Add media
            </button>
            {files.length > 0 && (
              <>
                <button
                  className="topBar__btn"
                  type="button"
                  onClick={() => {
                    if (busy) {
                      abortAll()
                      setBusy(false)
                      setUploadProgress({})
                    } else {
                      setFiles([])
                      setUploadProgress({})
                    }
                  }}
                  disabled={false}
                >
                  {busy ? 'Cancel' : `Clear (${files.length})`}
                </button>
              </>
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
          accept={ACCEPTED_MEDIA_TYPES}
          multiple
          onChange={event => {
            const list = Array.from(event.currentTarget.files ?? [])
            event.currentTarget.value = ''
            if (list.length) setFiles(list)
          }}
        />
        {busy && Object.keys(uploadProgress).length > 0 && (
          <div className="profile__meta">
            {Object.entries(uploadProgress).map(([key, percent]) => (
              <div key={key} style={{ marginTop: '4px' }}>
                Uploading: {percent}%
                <div style={{ width: '100%', height: '4px', background: '#eee', borderRadius: '2px', marginTop: '2px' }}>
                  <div style={{ width: `${percent}%`, height: '100%', background: '#4CAF50', borderRadius: '2px', transition: 'width 0.3s' }} />
                </div>
              </div>
            ))}
          </div>
        )}
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
