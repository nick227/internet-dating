import { useState, useMemo } from 'react'
import { useProfileSearch } from '../../core/profile/search/useProfileSearch'
import { ProfileSearchFilters } from '../profile/search/ProfileSearchFilters'
import { ProfileSearchQuickFilters } from '../profile/search/ProfileSearchQuickFilters'
import { ProfileSearchResults } from '../profile/search/ProfileSearchResults'
import { getErrorMessage } from '../../core/utils/errors'
import type { SearchFilters } from '../../core/profile/search/types'
import { useNavigate } from 'react-router-dom'

export function ProfileSearchPage() {
  const { filters, setFilters, results, loading, error, hasMore, loadMore, isShowingRecommendations } = useProfileSearch()
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false)
  const nav = useNavigate()
  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.q ||
      filters.gender?.length ||
      filters.intent?.length ||
      filters.ageMin ||
      filters.ageMax ||
      filters.location ||
      filters.traits?.length ||
      filters.interests?.length ||
      filters.interestSubjects?.length
    )
  }, [filters])

  const handleFiltersChange = (newFilters: SearchFilters) => {
    setFilters(newFilters)
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim()
    handleFiltersChange({
      ...filters,
      q: value || undefined,
      cursor: undefined,
    })
  }

  return (
    <div className="profiles-portal">
      <div className="profiles-portal__pad">
        <div className="profiles-portal__search">
          <input
            type="text"
            className="profiles-portal__search-input"
            placeholder="Search name, interest..."
            value={filters.q || ''}
            onChange={handleSearchChange}
          />
          <button
            type="button"
            className={`profiles-portal__search-filter-btn ${
              hasActiveFilters ? 'profiles-portal__search-filter-btn--active' : ''
            }`}
            onClick={() => setAdvancedFiltersOpen(true)}
            aria-label="Advanced filters"
          >
            ⚙️
          </button>
        </div>

      <ProfileSearchFilters
        open={advancedFiltersOpen}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onClose={() => setAdvancedFiltersOpen(false)}
      />

        <div className="profiles-portal__quick-filters">
          <ProfileSearchQuickFilters filters={filters} onFiltersChange={handleFiltersChange} />
        </div>

        <div className="profiles-portal__section-header">
          <h2 className="profiles-portal__section-title">Suggested Profiles</h2>
          <a href="#" className="profiles-portal__section-link" onClick={(e) => e.preventDefault()}>
            VIEW ALL
          </a>
          <button className="actionBtn btn-small" onClick={() => nav('/science')}>Site View</button>
        </div>

        <div className="profiles-portal__content">
          {error && (
            <div className="profiles-portal__error">
              {getErrorMessage(error, 'Search failed')}
            </div>
          )}
          <ProfileSearchResults
            profiles={results}
            loading={loading}
            hasMore={hasMore}
            onLoadMore={loadMore}
            isShowingRecommendations={isShowingRecommendations}
          />
        </div>
      </div>
    </div>
  )
}
