import { useState, useMemo, useEffect } from 'react'
import { SEARCH_DIMENSIONS } from '../../../core/profile/search/dimensions'
import { DimensionFilterFactory } from './DimensionFilterFactory'
import { apiParamsToDimensions } from '../../../core/profile/search/adapter'
import type { SearchFilters } from '../../../core/profile/search/types'

interface Props {
  open: boolean
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
  onClose: () => void
}

export function ProfileSearchFilters({ open, filters, onFiltersChange, onClose }: Props) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [pendingFilters, setPendingFilters] = useState<SearchFilters>(filters)
  const dimensionValues = useMemo(() => apiParamsToDimensions(pendingFilters, SEARCH_DIMENSIONS), [pendingFilters])

  useEffect(() => {
    if (open) {
      setPendingFilters(filters)
    }
  }, [open, filters])

  const toggleSection = (dimensionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(dimensionId)) {
        next.delete(dimensionId)
      } else {
        next.add(dimensionId)
      }
      return next
    })
  }

  const updateDimensionValue = (dimensionId: string, value: unknown) => {
    const newFilters: SearchFilters = { ...pendingFilters, cursor: undefined }
    
    switch (dimensionId) {
      case 'text':
        newFilters.q = (value as string) || undefined
        break
      case 'gender':
        newFilters.gender = (Array.isArray(value) && value.length > 0) ? value as string[] : undefined
        break
      case 'intent':
        newFilters.intent = (Array.isArray(value) && value.length > 0) ? value as string[] : undefined
        break
      case 'age': {
        const range = value as { min?: number; max?: number } | undefined
        if (range && (range.min !== undefined || range.max !== undefined)) {
          newFilters.ageMin = range.min
          newFilters.ageMax = range.max
        } else {
          delete newFilters.ageMin
          delete newFilters.ageMax
        }
        break
      }
      case 'location':
        newFilters.location = (value as string) || undefined
        break
      case 'traits': {
        const traits = Array.isArray(value) && value.length > 0 ? value as Array<{ key: string; min?: number; max?: number; group?: string }> : undefined
        newFilters.traits = traits
        break
      }
      case 'interests': {
        const interests = Array.isArray(value) && value.length > 0 ? value as string[] : undefined
        newFilters.interests = interests
        break
      }
      default:
        return
    }
    
    setPendingFilters(newFilters)
  }

  const handleApply = () => {
    onFiltersChange(pendingFilters)
    onClose()
  }

  const handleClear = () => {
    const clearedFilters: SearchFilters = {
      cursor: undefined,
    }
    setPendingFilters(clearedFilters)
    onFiltersChange(clearedFilters)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!open) return null

  const className = `profile-search-advanced-filters profile-search-advanced-filters--open`

  return (
    <div className={className} onClick={handleBackdropClick}>
      <div className="profile-search-advanced-filters__container" />
      <div className="profile-search-advanced-filters__panel" onClick={(e) => e.stopPropagation()}>
        <div className="profile-search-advanced-filters__handle" />
        <div className="profile-search-advanced-filters__content">
          <div className="profile-search-advanced-filters__header">
            <h2 className="profile-search-advanced-filters__title">Advanced Filters</h2>
            <button
              type="button"
              className="profile-search-advanced-filters__close-btn"
              onClick={onClose}
              aria-label="Close filters"
            >
              ×
            </button>
          </div>
          <div className="profile-search-advanced-filters__body">
            <div className="profile-search-advanced-filters__list">
              {SEARCH_DIMENSIONS.map(dimension => {
                const isExpanded = expandedSections.has(dimension.id)
                const value = dimensionValues.get(dimension.id)
                
                return (
                  <div key={dimension.id} className="profile-search-advanced-filters__section">
                    <button
                      type="button"
                      className={`profile-search-advanced-filters__section-header ${
                        isExpanded ? 'profile-search-advanced-filters__section-header--expanded' : ''
                      }`}
                      onClick={() => toggleSection(dimension.id)}
                    >
                      <span>{dimension.label}</span>
                      <span className="profile-search-advanced-filters__section-header-icon">▼</span>
                    </button>
                    <div className="profile-search-advanced-filters__section-content">
                      <DimensionFilterFactory
                        dimension={dimension}
                        value={value}
                        onChange={(v) => updateDimensionValue(dimension.id, v)}
                        filters={pendingFilters}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="profile-search-advanced-filters__actions">
            <button
              type="button"
              className="profile-search-advanced-filters__clear-btn"
              onClick={handleClear}
            >
              Clear All
            </button>
            <button
              type="button"
              className="profile-search-advanced-filters__apply-btn"
              onClick={handleApply}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
