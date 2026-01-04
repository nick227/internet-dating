import { useState, useEffect } from 'react'
import type { SearchDimension } from '../../../../core/profile/search/types'

interface Props {
  dimension: SearchDimension
  value: unknown
  onChange: (value: unknown) => void
}

export function TextSearchInput({ dimension, value, onChange }: Props) {
  const config = dimension.config as { placeholder?: string; minLength?: number }
  const [inputValue, setInputValue] = useState<string>(() => (typeof value === 'string' ? value : ''))

  useEffect(() => {
    if (typeof value === 'string') {
      setInputValue(value)
    } else if (value === null || value === undefined) {
      setInputValue('')
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    onChange(newValue || undefined)
  }

  return (
    <div className="search-filter">
      <label className="search-filter__label">{dimension.label}</label>
      <input
        type="text"
        className="search-filter__input"
        value={inputValue}
        onChange={handleChange}
        placeholder={config.placeholder}
        minLength={config.minLength}
      />
      {dimension.description && (
        <div className="search-filter__description">{dimension.description}</div>
      )}
    </div>
  )
}
