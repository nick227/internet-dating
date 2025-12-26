import type { ProfileMedia } from '../../api/types'

export function ProfileMediaRail({ items }: { items: ProfileMedia[] }) {
  if (!items.length) {
    return (
      <div className="u-glass profile__card">
        <div className="u-row-between" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 'var(--fs-4)', fontWeight: 650 }}>Media</div>
          <div className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>0</div>
        </div>
        <div className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>
          No media yet. Upload photos to show up here.
        </div>
      </div>
    )
  }

  return (
    <div className="u-glass profile__card">
      <div className="u-row-between" style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 'var(--fs-4)', fontWeight: 650 }}>Media</div>
        <div className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>{items.length}</div>
      </div>
      <div className="mediaRail u-hide-scroll">
        {items.map((m) => {
          const preview = m.thumbUrl ?? m.url
          const isVideo = m.type === 'VIDEO'
          return (
            <div key={String(m.id)} className="mediaThumb">
              {isVideo ? (
                <video src={m.url} poster={preview} muted playsInline preload="metadata" />
              ) : (
                <img src={preview} alt="" loading="lazy" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
