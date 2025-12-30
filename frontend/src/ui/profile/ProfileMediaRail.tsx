import { useState } from 'react'
import type { ProfileMedia } from '../../api/types'
import { api } from '../../api/client'

type Props = {
  items: ProfileMedia[]
  onMediaDelete?: (mediaId: string | number) => void
  readOnly?: boolean
}

export function ProfileMediaRail({ items, onMediaDelete, readOnly = false }: Props) {
  if (!items.length) {
    return (
      <div className="u-glass profile__card">
        <div className="u-stack">
          <div className="u-row-between">
            <div className="profile__sectionTitle">Media</div>
            <div className="profile__meta">0</div>
          </div>
          <div className="profile__meta">No media yet. Upload photos to show up here.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="u-glass profile__card">
      <div className="u-stack">
        <div className="u-row-between">
          <div className="profile__sectionTitle">Media</div>
          <div className="profile__meta">{items.length}</div>
        </div>
        <div className="mediaRail u-hide-scroll">
          {items.map(m => {
            const preview = m.thumbUrl ?? m.url
            const isVideo = m.type === 'VIDEO'
            return (
              <MediaThumb
                key={String(m.id)}
                media={m}
                preview={preview}
                isVideo={isVideo}
                onDelete={!readOnly && onMediaDelete ? () => onMediaDelete(m.id) : undefined}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MediaThumb({
  media,
  preview,
  isVideo,
  onDelete,
}: {
  media: ProfileMedia
  preview: string
  isVideo: boolean
  onDelete?: () => void
}) {
  const [deleteBusy, setDeleteBusy] = useState(false)

  const handleDelete = async () => {
    if (!onDelete) return
    if (!confirm('Delete this media?')) return
    setDeleteBusy(true)
    try {
      await api.media.delete(media.id)
      onDelete()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete media')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="mediaThumb u-relative">
      {isVideo ? (
        <video src={media.url} poster={preview} muted playsInline preload="metadata" />
      ) : (
        <img src={preview} alt="" loading="lazy" />
      )}
      {onDelete && (
        <button
          className="mediaDeleteBtn"
          type="button"
          onClick={handleDelete}
          disabled={deleteBusy}
          aria-label="Delete media"
        >
          {deleteBusy ? '...' : '×'}
        </button>
      )}
    </div>
  )
}
