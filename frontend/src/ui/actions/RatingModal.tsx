import type { RatingScores } from '../../api/types'
import { FullScreenModal } from '../ui/FullScreenModal'

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

const LEVELS = [1, 2, 3, 4, 5]

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
  return (
    <FullScreenModal
      open={open}
      onClose={onClose}
      title="Rate this profile"
      subtitle="Pick a quick score for each factor."
      showCloseButton={false}
    >
      <div className="fullScreenModal__ratingContainer">
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
      <div className="fullScreenModal__actions">
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
    </FullScreenModal>
  )
}
