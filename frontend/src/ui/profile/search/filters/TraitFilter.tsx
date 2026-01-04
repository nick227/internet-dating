import { useState, useEffect } from 'react'
import { api } from '../../../../api/client'
import { formatTraitKey } from '../../../../core/profile/search/formatTraitKey'
import type { SearchDimension, TraitFilter as TraitFilterType } from '../../../../core/profile/search/types'

const MAX_TRAITS = 3

interface Props {
  dimension: SearchDimension
  value: unknown
  onChange: (value: unknown) => void
}

interface TraitGroup {
  prefix: string
  traits: Array<{ key: string; count: number }>
}

export function TraitFilter({ dimension, value, onChange }: Props) {
  const selectedTraits = Array.isArray(value) ? (value as TraitFilterType[]) : []
  const [traitGroups, setTraitGroups] = useState<TraitGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    api.getSearchTraits()
      .then(res => {
        if (cancelled) return
        const groups: TraitGroup[] = Object.entries(res.traits).map(([prefix, traits]) => ({
          prefix,
          traits
        }))
        setTraitGroups(groups)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load traits')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const isTraitSelected = (key: string): boolean => {
    return selectedTraits.some(t => t.key === key)
  }

  const getTraitValue = (key: string): { min?: number; max?: number } => {
    const trait = selectedTraits.find(t => t.key === key)
    return { min: trait?.min, max: trait?.max }
  }

  const handleTraitToggle = (key: string) => {
    if (isTraitSelected(key)) {
      onChange(selectedTraits.filter(t => t.key !== key))
    } else {
      if (selectedTraits.length >= MAX_TRAITS) {
        return
      }
      onChange([...selectedTraits, { key, min: -10, max: 10 }])
    }
  }

  const handleRangeChange = (key: string, min?: number, max?: number) => {
    onChange(selectedTraits.map(t =>
      t.key === key ? { ...t, min, max } : t
    ))
  }

  const removeTrait = (key: string) => {
    onChange(selectedTraits.filter(t => t.key !== key))
  }

  if (loading) {
    return (
      <div className="search-filter">
        <label className="search-filter__label">{dimension.label}</label>
        <div className="search-filter__loading">Loading traits...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="search-filter">
        <label className="search-filter__label">{dimension.label}</label>
        <div className="search-filter__error">{error}</div>
      </div>
    )
  }

  const canAddMore = selectedTraits.length < MAX_TRAITS

  return (
    <div className="search-filter">
      <label className="search-filter__label">{dimension.label}</label>
      {dimension.description && (
        <div className="search-filter__description">{dimension.description}</div>
      )}
      <div className="search-filter__trait-info">
        {selectedTraits.length > 0 && (
          <div className="search-filter__trait-count">
            {selectedTraits.length} of {MAX_TRAITS} traits selected
          </div>
        )}
        {!canAddMore && (
          <div className="search-filter__trait-limit">Maximum {MAX_TRAITS} traits allowed</div>
        )}
      </div>

      {selectedTraits.length > 0 && (
        <div className="search-filter__selected-traits">
          {selectedTraits.map(trait => {
            const value = getTraitValue(trait.key)
            const displayKey = formatTraitKey(trait.key)
            return (
              <div key={trait.key} className="search-filter__trait-item">
                <div className="search-filter__trait-header">
                  <span className="search-filter__trait-name">{displayKey}</span>
                  <button
                    type="button"
                    className="search-filter__trait-remove"
                    onClick={() => removeTrait(trait.key)}
                  >
                    ×
                  </button>
                </div>
                <div className="search-filter__range">
                  <input
                    type="number"
                    className="search-filter__input"
                    value={value.min ?? ''}
                    onChange={e => {
                      const min = e.target.value ? Number(e.target.value) : undefined
                      handleRangeChange(trait.key, min, value.max)
                    }}
                    placeholder="Min"
                    min={-10}
                    max={10}
                    step={1}
                  />
                  <span className="search-filter__range-separator">-</span>
                  <input
                    type="number"
                    className="search-filter__input"
                    value={value.max ?? ''}
                    onChange={e => {
                      const max = e.target.value ? Number(e.target.value) : undefined
                      handleRangeChange(trait.key, value.min, max)
                    }}
                    placeholder="Max"
                    min={-10}
                    max={10}
                    step={1}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {canAddMore && (
        <div className="search-filter__trait-groups">
          {traitGroups.map(group => (
            <div key={group.prefix} className="search-filter__trait-group">
              <div className="search-filter__trait-group-label">
                {group.prefix.charAt(0).toUpperCase() + group.prefix.slice(1)}
              </div>
              <div className="search-filter__trait-list">
                {group.traits.map(trait => {
                  const displayKey = formatTraitKey(trait.key)
                  const selected = isTraitSelected(trait.key)
                  return (
                    <button
                      key={trait.key}
                      type="button"
                      className={`search-filter__trait-button${selected ? ' search-filter__trait-button--selected' : ''}`}
                      onClick={() => handleTraitToggle(trait.key)}
                      disabled={!selected && !canAddMore}
                    >
                      {displayKey} ({trait.count})
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}