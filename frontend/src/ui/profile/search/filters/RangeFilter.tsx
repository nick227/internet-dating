import { useState, useEffect } from 'react'
import type { SearchDimension } from '../../../../core/profile/search/types'

interface Props {
  dimension: SearchDimension
  value: unknown
  onChange: (value: unknown) => void
}

export function RangeFilter({ dimension, value, onChange }: Props) {
  const config = dimension.config as { min: number; max: number; step?: number; unit?: string }
  const rangeValue = (typeof value === 'object' && value !== null) ? value as { min?: number; max?: number } : {}
  
  const [minValue, setMinValue] = useState<string>(() => 
    rangeValue.min !== undefined ? String(rangeValue.min) : ''
  )
  const [maxValue, setMaxValue] = useState<string>(() => 
    rangeValue.max !== undefined ? String(rangeValue.max) : ''
  )

  useEffect(() => {
    const range = (typeof value === 'object' && value !== null) ? value as { min?: number; max?: number } : {}
    setMinValue(range.min !== undefined ? String(range.min) : '')
    setMaxValue(range.max !== undefined ? String(range.max) : '')
  }, [value])

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setMinValue(val)
    const min = val ? Number(val) : undefined
    const max = maxValue ? Number(maxValue) : undefined
    onChange(min !== undefined || max !== undefined ? { min, max } : undefined)
  }

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setMaxValue(val)
    const min = minValue ? Number(minValue) : undefined
    const max = val ? Number(val) : undefined
    onChange(min !== undefined || max !== undefined ? { min, max } : undefined)
  }

  return (
    <div className="search-filter">
      <label className="search-filter__label">{dimension.label}</label>
      <div className="search-filter__range">
        <input
          type="number"
          className="search-filter__input"
          value={minValue}
          onChange={handleMinChange}
          placeholder={`Min ${config.unit || ''}`.trim()}
          min={config.min}
          max={config.max}
          step={config.step || 1}
        />
        <span className="search-filter__range-separator">-</span>
        <input
          type="number"
          className="search-filter__input"
          value={maxValue}
          onChange={handleMaxChange}
          placeholder={`Max ${config.unit || ''}`.trim()}
          min={config.min}
          max={config.max}
          step={config.step || 1}
        />
      </div>
      {dimension.description && (
        <div className="search-filter__description">{dimension.description}</div>
      )}
    </div>
  )
}
