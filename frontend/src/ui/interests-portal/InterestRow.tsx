import type { InterestItem } from '../../api/client'
import { PortalItemFrame } from '../personality-portal/PortalItemFrame'

interface InterestRowProps {
  interest: InterestItem
  onToggle: (interestId: string) => void
  processing?: boolean
}

export function InterestRow({ interest, onToggle, processing = false }: InterestRowProps) {
  const handleClick = () => {
    if (!processing) {
      onToggle(interest.id)
    }
  }

  return (
    <PortalItemFrame
      as="button"
      type="button"
      className={`interest-card${interest.selected ? ' interest-card--selected' : ''}${processing ? ' interest-card--processing' : ''}`}
      intent="selectable"
      accent
      onClick={handleClick}
      disabled={processing}
    >
      <div className="interest-card__content">
        <div className="interest-card__header">
          <div className="interest-card__label portal-item__title">{interest.label}</div>
          <div className="portal-item__meta interest-card__checkbox">
            <div className={`interest-card__checkbox-inner${interest.selected ? ' interest-card__checkbox-inner--checked' : ''}`}>
              {interest.selected && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.6667 3.5L5.25 9.91667L2.33334 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          </div>
        </div>
        <div className="portal-item__meta-row">
          <span className="portal-item__meta-pill portal-item__meta-pill--muted">
            {interest.subject.label}
          </span>
          {interest.selected && (
            <span className="portal-item__meta-pill portal-item__meta-pill--accent">Selected</span>
          )}
        </div>
        <div className="portal-item__footer">
          {interest.selected ? (
            <span className="portal-item__footer-text portal-item__footer-text--accent">Added</span>
          ) : (
            <span className="portal-item__footer-spacer" />
          )}
        </div>
      </div>
    </PortalItemFrame>
  )
}
