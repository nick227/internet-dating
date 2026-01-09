import { createPortal } from 'react-dom'
import type { RatingScores } from '../../api/types'
import { useModalKeyboard } from '../../core/hooks/useModalKeyboard'

// RatingKey matches the keys of RatingScores - using type assertion for compatibility
export type RatingKey = keyof RatingScores
// RatingValues is the UI representation (1-5 scale) of RatingScores (2-10 scale)
export type RatingValues = Record<RatingKey, number>

const LABELS: Record<RatingKey, string> = {
  attractive: 'Attractive',
  smart: 'Smart',
  funny: 'Funny',
  interesting: 'Interesting',
}

const LEVELS = [1, 5]

export function RatingModal({
  open,
  values,
  submitting,
  onClose,
  onChange,
  onSubmit,
}: {
  open: boolean
  values: RatingValues
  submitting: boolean
  onClose: () => void
  onChange: (key: RatingKey, value: number) => void
  onSubmit: () => void
}) {
  useModalKeyboard(open, onClose)

  if (!open) return null

  const modal = (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Rate this profile">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__panel">
        <div className="modal__header">
          <div className="u-row u-gap-3" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 'var(--fs-5)', fontWeight: 700 }}>Rate this profile</div>
            <button
              className="topBar__btn btn-small"
              type="button"
              onClick={onClose}
              disabled={submitting}
            >
              Back
            </button>
          </div>
          <div className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>
            Pick a quick score for each factor.
          </div>
        </div>
        <div className="modal__body">
          <div className="ratingModal__container">
            {Object.keys(LABELS).map(key => {
              const label = LABELS[key as RatingKey]
              const value = values[key as RatingKey]
              return (
                <div key={key} className="ratingRow">
                  <div className="ratingLabel">{label}</div>
                  <div className="ratingButtons">
                    {LEVELS.map(level => (
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
        </div>
        <div className="modal__actions">
          <button
            className="actionBtn actionBtn--nope"
            type="button"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="actionBtn actionBtn--like"
            type="button"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? 'Saving...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') {
    return modal
  }

  return createPortal(modal, document.body)
}
