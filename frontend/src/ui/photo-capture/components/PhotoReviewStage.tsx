import React, { useState } from 'react'
import { PhotoReviewItem } from './PhotoReviewItem'

function getGridClass(count: number): string {
  if (count === 1) return 'photo-grid-1'
  if (count === 2) return 'photo-grid-2'
  if (count === 3) return 'photo-grid-3'
  if (count === 4) return 'photo-grid-4'
  if (count <= 6) return 'photo-grid-6'
  if (count <= 9) return 'photo-grid-9'
  return 'photo-grid-many'
}

export function PhotoReviewStage(props: {
  photos: Blob[]
  photoUrls: string[]
  onBackToCamera: () => void
  onRemove: (index: number) => void
  onPost: (note: string) => void
  onDiscard: () => void
  isPosting?: boolean
  postError?: string | null
}) {
  const { photos, photoUrls, onBackToCamera, onRemove, onPost, onDiscard, isPosting = false, postError } = props
  const [note, setNote] = useState('')
  const gridClass = getGridClass(photos.length)

  return (
    <div className="col video-capture__review">
      <div className={`video-capture__preview photo-grid ${gridClass}`}>
        {photos.map((photo, index) => (
          <PhotoReviewItem
            key={index}
            url={photoUrls[index]}
            index={index}
            onRemove={onRemove}
          />
        ))}
      </div>

      <div className="col">
        <label className="small">Caption</label>
        <input
          className="video-capture__caption"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Say something..."
          disabled={isPosting}
        />
        {postError && (
          <div className="meta" style={{ color: 'var(--danger)', marginTop: 'var(--s-1)' }}>
            {postError}
          </div>
        )}
      </div>

      <div className="row video-capture__reviewActions">
        <button className="btn" onClick={onBackToCamera} type="button" disabled={isPosting}>
          Add More
        </button>
        <button className="btn danger" onClick={onDiscard} type="button" disabled={isPosting}>
          Discard All
        </button>
        <button className="btn primary" onClick={() => onPost(note)} type="button" disabled={isPosting}>
          {isPosting ? 'Posting...' : `Post ${photos.length > 1 ? `(${photos.length})` : ''}`}
        </button>
      </div>
    </div>
  )
}
