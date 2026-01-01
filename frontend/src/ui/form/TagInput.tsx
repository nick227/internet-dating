import { useCallback, useEffect, useRef, useState } from 'react'

type Props = {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  maxTags?: number
  suggestions?: string[]
  testId?: string
  inputTestId?: string
}

export function TagInput({
  value,
  onChange,
  placeholder = 'Add tags...',
  maxTags = 5,
  suggestions = [],
  testId,
  inputTestId,
}: Props) {
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const filteredSuggestions = suggestions.filter(
    s => s.toLowerCase().includes(inputValue.toLowerCase()) && !value.includes(s)
  )

  const handleAddTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim().toLowerCase()
      if (!trimmed || value.includes(trimmed) || value.length >= maxTags) return
      onChange([...value, trimmed])
      setInputValue('')
      setShowSuggestions(false)
    },
    [value, onChange, maxTags]
  )

  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      onChange(value.filter(t => t !== tagToRemove))
    },
    [value, onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && inputValue.trim()) {
        e.preventDefault()
        handleAddTag(inputValue)
      } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
        handleRemoveTag(value[value.length - 1])
      } else if (e.key === 'Escape') {
        setShowSuggestions(false)
      }
    },
    [inputValue, value, handleAddTag, handleRemoveTag]
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div
      ref={containerRef}
      className="u-stack"
      style={{ gap: 'var(--s-2)' }}
      data-testid={testId}
    >
      <div className="u-row u-gap-2 u-wrap" style={{ alignItems: 'center' }}>
        {value.map(tag => (
          <div
            key={tag}
            className="inlineChip inlineChip--active"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)' }}
          >
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => handleRemoveTag(tag)}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: 0,
                fontSize: 'var(--fs-3)',
              }}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </div>
        ))}
        {value.length < maxTags && (
          <div style={{ position: 'relative', flex: 1, minWidth: '120px' }}>
            <input
              ref={inputRef}
              type="text"
              data-testid={inputTestId}
              value={inputValue}
              onChange={e => {
                setInputValue(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="inlineField__input"
              style={{ width: '100%', minWidth: '120px' }}
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  background: 'rgba(15,15,25,.95)',
                  border: '1px solid rgba(255,255,255,.12)',
                  borderRadius: 'var(--r-3)',
                  padding: 'var(--s-1)',
                  zIndex: 1000,
                  maxHeight: '200px',
                  overflow: 'auto',
                }}
              >
                {filteredSuggestions.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleAddTag(suggestion)}
                    style={{
                      width: '100%',
                      padding: 'var(--s-2)',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      borderRadius: 'var(--r-1)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(255,255,255,.08)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'none'
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {value.length > 0 && (
        <div className="profile__meta" style={{ fontSize: 'var(--fs-1)' }}>
          {value.length}/{maxTags} tags
        </div>
      )}
    </div>
  )
}
