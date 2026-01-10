import { useState, useMemo, useEffect } from 'react'
import { SEARCH_DIMENSIONS } from '../../../core/profile/search/dimensions'
import { DimensionFilterFactory } from './DimensionFilterFactory'
import { apiParamsToDimensions } from '../../../core/profile/search/adapter'
import type { SearchFilters } from '../../../core/profile/search/types'
import type { Gender, DatingIntent } from '../../../api/types'
import { useCurrentUser } from '../../../core/auth/useCurrentUser'
import { api } from '../../../api/client'

const VALID_GENDERS: Set<string> = new Set(['UNSPECIFIED', 'MALE', 'FEMALE', 'NONBINARY', 'OTHER'])
const VALID_INTENTS: Set<string> = new Set(['UNSPECIFIED', 'FRIENDS', 'CASUAL', 'LONG_TERM', 'MARRIAGE'])

function filterValidGenders(values: string[]): Gender[] {
  return values.filter(v => VALID_GENDERS.has(v)) as Gender[]
}

function filterValidIntents(values: string[]): DatingIntent[] {
  return values.filter(v => VALID_INTENTS.has(v)) as DatingIntent[]
}

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
  const { userId, profile: currentUserProfile } = useCurrentUser()
  const hasLocation = Boolean(currentUserProfile?.locationText)
  const radiusOptions = [
    { km: 16, label: '10 mi' },
    { km: 25, label: '16 mi' },
    { km: 50, label: '31 mi' },
    { km: 100, label: '62 mi' },
  ]
  const [locationDraft, setLocationDraft] = useState(currentUserProfile?.locationText ?? '')
  const [locationSaving, setLocationSaving] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [locationSaved, setLocationSaved] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)

  useEffect(() => {
    setLocationDraft(currentUserProfile?.locationText ?? '')
  }, [currentUserProfile?.locationText])

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
        newFilters.gender = (Array.isArray(value) && value.length > 0) ? filterValidGenders(value as string[]) : undefined
        break
      case 'intent':
        newFilters.intent = (Array.isArray(value) && value.length > 0) ? filterValidIntents(value as string[]) : undefined
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

  const toggleNearMe = () => {
    setPendingFilters(prev => {
      const enable = !prev.nearMe
      return {
        ...prev,
        nearMe: enable ? true : undefined,
        radiusKm: enable ? (prev.radiusKm ?? 25) : undefined,
        location: enable ? undefined : prev.location,
        cursor: undefined,
      }
    })
  }

  const updateRadius = (value: number) => {
    setPendingFilters(prev => ({
      ...prev,
      nearMe: true,
      radiusKm: value,
      location: undefined,
      cursor: undefined,
    }))
  }

  const saveLocation = async () => {
    if (!userId) return
    setLocationSaving(true)
    setLocationError(null)
    setLocationSaved(false)
    try {
      await api.profileUpdate(userId, {
        locationText: locationDraft.trim() || null,
      })
      setLocationSaved(true)
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : 'Failed to update location')
    } finally {
      setLocationSaving(false)
    }
  }

  const useDeviceLocation = () => {
    if (!userId) return
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported in this browser.')
      return
    }
    setGeoLoading(true)
    setLocationError(null)
    setLocationSaved(false)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = position.coords.latitude
          const lng = position.coords.longitude
          const resolved = await api.reverseGeocode({ lat, lng })
          setLocationDraft(resolved.locationText ?? '')
          await api.profileUpdate(userId, {
            locationText: resolved.locationText ?? null,
            lat,
            lng,
          })
          setLocationSaved(true)
        } catch (err) {
          setLocationError(err instanceof Error ? err.message : 'Failed to use device location')
        } finally {
          setGeoLoading(false)
        }
      },
      (error) => {
        setLocationError(error.message || 'Unable to access device location')
        setGeoLoading(false)
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    )
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
              <div className="search-filter">
                <label className="search-filter__label">Your location</label>
                <div className="search-filter__description">
                  {currentUserProfile?.locationText || 'No location set yet.'} Near Me uses device location. Increase the radius if results are sparse.
                </div>
                <div className="search-filter__range">
                  <input
                    className="search-filter__input"
                    type="text"
                    value={locationDraft}
                    onChange={(e) => setLocationDraft(e.target.value)}
                    placeholder="City, State"
                  />
                  <button
                    type="button"
                    className="actionBtn btn-small"
                    onClick={saveLocation}
                    disabled={!userId || locationSaving}
                  >
                    {locationSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="actionBtn btn-small"
                    onClick={useDeviceLocation}
                    disabled={!userId || geoLoading}
                  >
                    {geoLoading ? 'Locating...' : 'Use device'}
                  </button>
                </div>
                {locationError && (
                  <div className="search-filter__error">{locationError}</div>
                )}
                {locationSaved && (
                  <div className="search-filter__description">
                    Saved. Use device location for distance-based results.
                  </div>
                )}
              </div>
              <div className="search-filter">
                <label className="search-filter__label">Near Me</label>
                {!hasLocation && (
                  <div className="search-filter__description">
                    Set your location in your profile to enable distance search.
                  </div>
                )}
                <div className="search-filter__range">
                  <button
                    type="button"
                    className="actionBtn btn-small"
                    onClick={toggleNearMe}
                    disabled={!hasLocation}
                  >
                    {pendingFilters.nearMe ? 'Near Me On' : 'Near Me Off'}
                  </button>
                  <select
                    className="search-filter__input"
                    value={pendingFilters.radiusKm ?? 25}
                    onChange={(e) => updateRadius(Number(e.target.value))}
                    disabled={!pendingFilters.nearMe || !hasLocation}
                  >
                    {radiusOptions.map((option) => (
                      <option key={option.km} value={option.km}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
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
