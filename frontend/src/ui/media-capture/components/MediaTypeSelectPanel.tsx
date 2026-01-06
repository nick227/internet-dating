export type MediaType = 'video' | 'photo'

export function MediaTypeSelectPanel(props: {
  onSelectVideo: () => void
  onSelectPhoto: () => void
}) {
  const { onSelectVideo, onSelectPhoto } = props

  return (
    <div className="col">
      <div className="meta">Capture Type</div>
      <div className="seg">
        <button className="btn" onClick={onSelectPhoto} type="button">
          Photo
        </button>
        <button className="btn" onClick={onSelectVideo} type="button">
          Video
        </button>
      </div>
    </div>
  )
}
