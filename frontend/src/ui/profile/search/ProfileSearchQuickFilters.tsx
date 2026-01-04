import type { Gender, DatingIntent } from '../../../api/types'
import type { SearchFilters } from '../../../core/profile/search/types'

interface Props {
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
}

interface QuickFilter {
  id: string
  label: string
  icon?: string
  isActive: (filters: SearchFilters) => boolean
  onClick: (filters: SearchFilters) => SearchFilters
}

export function ProfileSearchQuickFilters({ filters, onFiltersChange }: Props) {
  const quickFilters: QuickFilter[] = [
    {
      id: 'all',
      label: 'All',
      isActive: () => {
        return !filters.gender?.length && !filters.intent?.length
      },
      onClick: () => ({
        ...filters,
        gender: undefined,
        intent: undefined,
        cursor: undefined,
      }),
    },
    {
      id: 'near-me',
      label: 'Near Me',
      icon: '📍',
      isActive: () => !!filters.location,
      onClick: (current) => ({
        ...current,
        location: current.location ? undefined : 'near me',
        cursor: undefined,
      }),
    },
    {
      id: 'women',
      label: 'Women',
      isActive: (current) => current.gender?.includes('FEMALE' as Gender) ?? false,
      onClick: (current) => {
        const genders = current.gender || []
        const hasFemale = genders.includes('FEMALE' as Gender)
        return {
          ...current,
          gender: hasFemale
            ? genders.filter((g) => g !== 'FEMALE')
            : [...genders, 'FEMALE' as Gender],
          cursor: undefined,
        }
      },
    },
    {
      id: 'men',
      label: 'Men',
      isActive: (current) => current.gender?.includes('MALE' as Gender) ?? false,
      onClick: (current) => {
        const genders = current.gender || []
        const hasMale = genders.includes('MALE' as Gender)
        return {
          ...current,
          gender: hasMale
            ? genders.filter((g) => g !== 'MALE')
            : [...genders, 'MALE' as Gender],
          cursor: undefined,
        }
      },
    },
    {
      id: 'friends',
      label: 'Friends',
      isActive: (current) => current.intent?.includes('FRIENDS' as DatingIntent) ?? false,
      onClick: (current) => {
        const intents = current.intent || []
        const hasFriends = intents.includes('FRIENDS' as DatingIntent)
        return {
          ...current,
          intent: hasFriends
            ? intents.filter((i) => i !== 'FRIENDS')
            : [...intents, 'FRIENDS' as DatingIntent],
          cursor: undefined,
        }
      },
    },
    {
      id: 'dating',
      label: 'Dating',
      isActive: (current) => {
        const intents = current.intent || []
        return (
          intents.includes('CASUAL' as DatingIntent) ||
          intents.includes('LONG_TERM' as DatingIntent) ||
          intents.includes('MARRIAGE' as DatingIntent)
        )
      },
      onClick: (current) => {
        const intents = current.intent || []
        const datingIntents: DatingIntent[] = ['CASUAL', 'LONG_TERM', 'MARRIAGE']
        const hasAnyDating = datingIntents.some((i) => intents.includes(i))
        return {
          ...current,
          intent: hasAnyDating
            ? intents.filter((i) => !datingIntents.includes(i))
            : [...intents, ...datingIntents],
          cursor: undefined,
        }
      },
    },
  ]

  const handleFilterClick = (filter: QuickFilter) => {
    const newFilters = filter.onClick(filters)
    onFiltersChange(newFilters)
  }

  return (
    <div className="profile-search-quick-filters">
      <div className="profile-search-quick-filters__list">
        {quickFilters.map((filter) => {
          const isActive = filter.isActive(filters)
          return (
            <button
              key={filter.id}
              type="button"
              className={`profile-search-quick-filters__button ${
                isActive ? 'profile-search-quick-filters__button--active' : ''
              }`}
              onClick={() => handleFilterClick(filter)}
            >
              {filter.icon && (
                <span className="profile-search-quick-filters__button-icon">{filter.icon}</span>
              )}
              {filter.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
