import { useState, useCallback } from 'react'
import { useInterestsDiscovery } from '../interests-portal/hooks/useInterestsDiscovery'
import { useInterestsSubjects } from '../interests-portal/hooks/useInterestsSubjects'
import { useInterestSelection } from '../interests-portal/hooks/useInterestSelection'
import { InterestFilterBar } from '../interests-portal/InterestFilterBar'
import { InterestList } from '../interests-portal/InterestList'
import { PersonalityPortalFrame } from '../personality-portal/PersonalityPortalFrame'

type InterestsPortalPageProps = {
  variant?: 'standalone' | 'embedded'
}

export function InterestsPortalPage({ variant = 'standalone' }: InterestsPortalPageProps) {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const isEmbedded = variant === 'embedded'
  
  const { subjects } = useInterestsSubjects()
  const { toggle, reconcile, isProcessing, isSelected } = useInterestSelection()
  const {
    items,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    error,
  } = useInterestsDiscovery(selectedSubjectId, '', reconcile)

  const handleToggle = useCallback(async (interestId: string) => {
    try {
      await toggle(interestId)
    } catch (e) {
      console.error('Failed to toggle interest:', e)
    }
  }, [toggle])

  return (
    <PersonalityPortalFrame variant={variant}>
      <div className="interests-portal">
        <div className="portal-shell__body">
          <div className={`portal-shell__filters${isEmbedded ? '' : ' portal-shell__filters--sticky'}`}>
            <InterestFilterBar
              subjects={subjects}
              selectedSubjectId={selectedSubjectId}
              onSubjectChange={setSelectedSubjectId}
            />
          </div>
          
          <div className="portal-shell__main interests-portal__grid">
            {error && (
              <div className="interests-portal__error">
                <p>{error}</p>
                <button
                  type="button"
                  className="interests-portal__error-retry"
                  onClick={() => window.location.reload()}
                >
                  Retry
                </button>
              </div>
            )}
          <InterestList
            items={items.map(item => ({
              ...item,
              selected: isSelected(item.id),
            }))}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onToggle={handleToggle}
            isProcessing={isProcessing}
            isFiltered={Boolean(selectedSubjectId)}
          />
        </div>
      </div>
      </div>
    </PersonalityPortalFrame>
  )
}
