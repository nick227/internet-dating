import { useEffect } from 'react'

export type RatingKey = 'attractive' | 'smart' | 'funny' | 'interesting'
export type RatingValues = Record<RatingKey, number>

const LABELS: Record<RatingKey, string> = {
  attractive: 'Attractive',
  smart: 'Smart',
  funny: 'Funny',
  interesting: 'Interesting'
}

const LEVELS = [1, 2, 3, 4, 5]

export function RatingModal({
  open,
  values,
  submitting,
  onClose,
  onChange,
  onSubmit
}: {
  open: boolean
  values: RatingValues
  submitting: boolean
  onClose: () => void
  onChange: (key: RatingKey, value: number) => void
  onSubmit: () => void
}) {
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Rate profile">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__panel">
        <div className="modal__header">
          <div style={{ fontSize: 'var(--fs-5)', fontWeight: 700 }}>Rate this profile</div>
          <div className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>Pick a quick score for each factor.</div>
        </div>

        <div className="modal__body">
          {Object.keys(LABELS).map((key) => {
            const label = LABELS[key as RatingKey]
            const value = values[key as RatingKey]
            return (
              <div key={key} className="ratingRow">
                <div className="ratingLabel">{label}</div>
                <div className="ratingButtons">
                  {LEVELS.map((level) => (
                    <button
                      key={level}
                      className={'ratingBtn' + (value === level ? ' ratingBtn--active' : '')}
                      type="button"
                      onClick={() => onChange(key as RatingKey, level)}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="modal__actions">
          <button className="actionBtn actionBtn--nope" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="actionBtn actionBtn--like" type="button" onClick={onSubmit} disabled={submitting}>
            {submitting ? 'Saving...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}
