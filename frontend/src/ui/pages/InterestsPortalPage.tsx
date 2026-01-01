import { useState, useCallback } from 'react'
import { useInterestsDiscovery } from '../interests-portal/hooks/useInterestsDiscovery'
import { useInterestsSubjects } from '../interests-portal/hooks/useInterestsSubjects'
import { useInterestSelection } from '../interests-portal/hooks/useInterestSelection'
import { InterestFilterBar } from '../interests-portal/InterestFilterBar'
import { InterestList } from '../interests-portal/InterestList'
import { InterestSearchTextarea } from '../interests-portal/InterestSearchTextarea'
import type { InterestItem } from '../../api/client'

export function InterestsPortalPage() {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  
  const { subjects, loading: subjectsLoading } = useInterestsSubjects()
  const {
    items,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    updateItemSelection,
    error,
  } = useInterestsDiscovery(selectedSubjectId, '')
  
  const { selectInterest, deselectInterest, isProcessing } = useInterestSelection()

  const handleToggle = useCallback(async (interestId: string, selected: boolean) => {
    // Optimistic update - toggle to opposite state
    const newState = !selected
    updateItemSelection(interestId, newState)

    try {
      if (selected) {
        // Currently selected, so deselect
        await deselectInterest(interestId)
      } else {
        // Currently not selected, so select
        await selectInterest(interestId)
      }
      // State already updated optimistically, no need to update again
    } catch (e) {
      // Revert on error - restore original state
      updateItemSelection(interestId, selected)
      console.error('Failed to toggle interest:', e)
    }
  }, [selectInterest, deselectInterest, updateItemSelection])

  const handleInterestSelect = useCallback(async (interest: InterestItem) => {
    if (interest.selected) return

    // Optimistic update
    updateItemSelection(interest.id, true)

    try {
      await selectInterest(interest.id)
      // State already updated optimistically
    } catch (e) {
      // Revert on error
      updateItemSelection(interest.id, false)
      console.error('Failed to select interest:', e)
    }
  }, [selectInterest, updateItemSelection])

  const handleNewInterestSubmit = useCallback(async (text: string) => {
    // Note: Currently, users must select from existing interests
    // In the future, this could create a new interest via API
    console.log('New interest submitted (not yet implemented):', text)
    // TODO: Add API endpoint to create new interests if needed
  }, [])

  return (
    <div className="interests-portal">
      <div className="interests-portal__hero">
        <div className="interests-portal__hero-content">
          <h1 className="interests-portal__title">Your Interests</h1>
          <p className="interests-portal__subtitle">
            We use this to find better connections.
          </p>
          
          {!subjectsLoading && (
            <div className="interests-portal__search">
              <InterestSearchTextarea
                subjectId={selectedSubjectId}
                onInterestSelect={handleInterestSelect}
                onNewInterestSubmit={handleNewInterestSubmit}
                placeholder="Type to search or add interests..."
              />
            </div>
          )}
        </div>
      </div>

      <div className="interests-portal__filters">
        <InterestFilterBar
          subjects={subjects}
          selectedSubjectId={selectedSubjectId}
          onSubjectChange={setSelectedSubjectId}
        />
      </div>
      
      <div className="interests-portal__grid">
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
          items={items}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onToggle={handleToggle}
          isProcessing={isProcessing}
        />
      </div>
    </div>
  )
}
