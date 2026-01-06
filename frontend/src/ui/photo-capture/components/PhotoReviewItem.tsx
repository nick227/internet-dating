import React from 'react'

export function PhotoReviewItem(props: {
  url: string
  index: number
  onRemove: (index: number) => void
}) {
  const { url, index, onRemove } = props

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <img
        src={url}
        alt={`Photo ${index + 1}`}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: 'var(--r-2)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      />
      <button
        className="btn danger"
        onClick={() => onRemove(index)}
        type="button"
        style={{
          position: 'absolute',
          top: 'var(--s-2)',
          right: 'var(--s-2)',
          width: '32px',
          height: '32px',
          padding: 0,
          borderRadius: '50%',
          fontSize: '18px',
          lineHeight: '1',
        }}
        aria-label={`Remove photo ${index + 1}`}
      >
        ×
      </button>
    </div>
  )
}
