import { useState, useCallback } from 'react'
import { useInterestsDiscovery } from '../interests-portal/hooks/useInterestsDiscovery'
import { useInterestsSubjects } from '../interests-portal/hooks/useInterestsSubjects'
import { useInterestSelection } from '../interests-portal/hooks/useInterestSelection'
import { InterestFilterBar } from '../interests-portal/InterestFilterBar'
import { InterestList } from '../interests-portal/InterestList'
import { InterestSearchTextarea } from '../interests-portal/InterestSearchTextarea'
import type { InterestItem } from '../../api/client'
import { PersonalityPortalFrame } from '../personality-portal/PersonalityPortalFrame'

type InterestsPortalPageProps = {
  variant?: 'standalone' | 'embedded'
}

export function InterestsPortalPage({ variant = 'standalone' }: InterestsPortalPageProps) {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const isEmbedded = variant === 'embedded'
  
  const { subjects, loading: subjectsLoading } = useInterestsSubjects()
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

  const handleInterestSelect = useCallback(async (interest: InterestItem) => {
    if (isSelected(interest.id)) return
    try {
      await toggle(interest.id)
    } catch (e) {
      console.error('Failed to select interest:', e)
    }
  }, [isSelected, toggle])

  const handleNewInterestSubmit = useCallback(async (text: string) => {
    // Note: Currently, users must select from existing interests
    // In the future, this could create a new interest via API
    console.log('Newbbb interest submitted (not yet implemented):', text)
    // TODO: Add API endpoint to create new interests if needed
  }, [])

  const searchBlock = !subjectsLoading ? (
    <div className="portal-shell__search">
      <InterestSearchTextarea
        subjectId={selectedSubjectId}
        onInterestSelect={handleInterestSelect}
        onNewInterestSubmit={handleNewInterestSubmit}
        placeholder="Type to search or add interests..."
      />
    </div>
  ) : null

  return (
    <PersonalityPortalFrame variant={variant}>
      <div className="interests-portal">
        <div className="portal-shell__body">
          {searchBlock}
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
