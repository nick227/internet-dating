import type { InterestItem } from '../../api/client'

interface InterestRowProps {
  interest: InterestItem
  onToggle: (interestId: string, selected: boolean) => void
  processing?: boolean
}

export function InterestRow({ interest, onToggle, processing = false }: InterestRowProps) {
  const handleClick = () => {
    if (!processing) {
      onToggle(interest.id, interest.selected)
    }
  }

  return (
    <button
      type="button"
      className={`interest-card${interest.selected ? ' interest-card--selected' : ''}${processing ? ' interest-card--processing' : ''}`}
      onClick={handleClick}
      disabled={processing}
    >
      <div className="interest-card__checkbox">
        <div className={`interest-card__checkbox-inner${interest.selected ? ' interest-card__checkbox-inner--checked' : ''}`}>
          {interest.selected && (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.6667 3.5L5.25 9.91667L2.33334 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      </div>
      <div className="interest-card__content">
        <div className="interest-card__label">{interest.label}</div>
        <div className="interest-card__subject">{interest.subject.label}</div>
      </div>
    </button>
  )
}
