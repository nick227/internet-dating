import { useState, useCallback, useMemo } from 'react'
import { useInterestsDiscovery } from '../../../interests-portal/hooks/useInterestsDiscovery'
import { useInterestsSubjects } from '../../../interests-portal/hooks/useInterestsSubjects'
import { InterestList } from '../../../interests-portal/InterestList'
import { InterestSearchTextarea } from '../../../interests-portal/InterestSearchTextarea'
import { InterestFilterBar } from '../../../interests-portal/InterestFilterBar'
import type { SearchDimension } from '../../../../core/profile/search/types'
import type { InterestItem } from '../../../../api/client'

interface Props {
  dimension: SearchDimension
  value: unknown
  onChange: (value: unknown) => void
}

export function InterestFilter({ dimension, value, onChange }: Props) {
  const selectedInterestIds = useMemo(() => Array.isArray(value) ? (value as string[]) : [], [value])
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const { subjects } = useInterestsSubjects()

  const {
    items,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    error,
  } = useInterestsDiscovery(selectedSubjectId, '')

  const handleToggle = useCallback(async (interestId: string) => {
    const isSelected = selectedInterestIds.includes(interestId)
    const newIds = isSelected
      ? selectedInterestIds.filter(id => id !== interestId)
      : [...selectedInterestIds, interestId]
    onChange(newIds)
  }, [selectedInterestIds, onChange])

  const handleInterestSelect = useCallback(async (interest: InterestItem) => {
    if (selectedInterestIds.includes(interest.id)) return
    onChange([...selectedInterestIds, interest.id])
  }, [selectedInterestIds, onChange])

  const handleNewInterestSubmit = useCallback((text: string) => {
    console.log('Newzzz interest submitted (not yet implemented):', text)
  }, [])

  const isSelected = useCallback((id: string) => {
    return selectedInterestIds.includes(id)
  }, [selectedInterestIds])

  const isProcessing = useCallback((_id: string) => {
    return false
  }, [])

  return (
    <div className="search-filter search-filter--interests">
      <label className="search-filter__label">{dimension.label}</label>
      {dimension.description && (
        <div className="search-filter__description">{dimension.description}</div>
      )}

      <div className="search-filter__interest-filters">
        <InterestFilterBar
          subjects={subjects}
          selectedSubjectId={selectedSubjectId}
          onSubjectChange={setSelectedSubjectId}
        />
      </div>

      <div className="search-filter__interest-search">
        <InterestSearchTextarea
          subjectId={selectedSubjectId}
          onInterestSelect={handleInterestSelect}
          onNewInterestSubmit={handleNewInterestSubmit}
          placeholder="Search interests..."
        />
      </div>

      {selectedInterestIds.length > 0 && (
        <div className="search-filter__selected-interests">
          <div className="search-filter__selected-count">
            {selectedInterestIds.length} interest{selectedInterestIds.length !== 1 ? 's' : ''} selected
          </div>
        </div>
      )}

      <div className="search-filter__interest-list">
        {error && (
          <div className="search-filter__error">{error}</div>
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
  )
}