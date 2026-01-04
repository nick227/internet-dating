import type { SearchDimension } from '../../../../core/profile/search/types'

interface Props {
  dimension: SearchDimension
  value: unknown
  onChange: (value: unknown) => void
}

export function EnumFilter({ dimension, value, onChange }: Props) {
  const config = dimension.config as { options: Array<{ value: string; label: string }>; multiSelect?: boolean }
  const selected = Array.isArray(value) ? value : value ? [value] : []

  const handleToggle = (optionValue: string) => {
    if (config.multiSelect) {
      const newSelected = selected.includes(optionValue)
        ? selected.filter(v => v !== optionValue)
        : [...selected, optionValue]
      onChange(newSelected.length > 0 ? newSelected : undefined)
    } else {
      onChange(selected.includes(optionValue) ? undefined : optionValue)
    }
  }

  return (
    <div className="search-filter">
      <label className="search-filter__label">{dimension.label}</label>
      <div className="search-filter__options">
        {config.options.map(option => {
          const isSelected = selected.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              className={`search-filter__option${isSelected ? ' search-filter__option--active' : ''}`}
              onClick={() => handleToggle(option.value)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {dimension.description && (
        <div className="search-filter__description">{dimension.description}</div>
      )}
    </div>
  )
}
