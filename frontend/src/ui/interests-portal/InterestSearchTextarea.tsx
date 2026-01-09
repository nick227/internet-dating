import { useCallback, useEffect, useState, useRef } from 'react'
import { SmartTextarea } from '../form/SmartTextarea'
import { api, type InterestItem } from '../../api/client'

interface InterestSearchTextareaProps {
  subjectId: string | null
  onInterestSelect: (interest: InterestItem) => void
  onNewInterestSubmit?: (text: string) => void
  placeholder?: string
}

export function InterestSearchTextarea({
  subjectId,
  onInterestSelect,
  onNewInterestSubmit,
  placeholder = 'Type to search or add interests...',
}: InterestSearchTextareaProps) {
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<InterestItem[]>([])
  const [searching, setSearching] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const searchInterests = useCallback(async (text: string) => {
    if (!text.trim()) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    setSearching(true)
    try {
      const body = subjectId ? { text: text.trim(), subjectId } : { text: text.trim() }
      const res = await api.interests.search(body)
      setSuggestions(res.items)
      setShowSuggestions(res.items.length > 0)
    } catch (e) {
      console.error('Failed to search interests:', e)
      setSuggestions([])
      setShowSuggestions(false)
    } finally {
      setSearching(false)
    }
  }, [subjectId])

  useEffect(() => {
    const timer = setTimeout(() => {
      searchInterests(value)
    }, 300)

    return () => clearTimeout(timer)
  }, [value, searchInterests])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = useCallback((interest: InterestItem) => {
    onInterestSelect(interest)
    setValue('')
    setSuggestions([])
    setShowSuggestions(false)
  }, [onInterestSelect])

  const handleSubmit = useCallback(async () => {
    const text = value.trim()
    if (!text || submitting) return

    // First check if there's an exact match in suggestions
    const exactMatch = suggestions.find(
      s => s.label.toLowerCase() === text.toLowerCase()
    )

    if (exactMatch) {
      handleSelect(exactMatch)
      return
    }

    // If no exact match and we have suggestions, use the first one
    if (suggestions.length > 0) {
      handleSelect(suggestions[0])
      return
    }

    // If no suggestions, allow submitting new text
    if (onNewInterestSubmit) {
      setSubmitting(true)
      try {
        await onNewInterestSubmit(text)
        setValue('')
        setSuggestions([])
        setShowSuggestions(false)
      } catch (e) {
        console.error('Failed to submit new interest:', e)
      } finally {
        setSubmitting(false)
      }
    }
  }, [value, suggestions, submitting, handleSelect, onNewInterestSubmit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }, [handleSubmit])

  return (
    <div className="interest-search-textarea" ref={containerRef}>
      <div className="interest-search-textarea__wrapper">
        <SmartTextarea
          value={value}
          onChange={setValue}
          placeholder={placeholder}
          className="interest-search-textarea__input"
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className={`btn-small interest-search-textarea__submit${submitting ? ' interest-search-textarea__submit--loading' : ''}`}
          onClick={handleSubmit}
          disabled={!value.trim() || submitting}
        >
          {submitting ? (
            <div className="interest-search-textarea__submit-spinner"></div>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3.33334 10H16.6667M16.6667 10L11.6667 5M16.6667 10L11.6667 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      </div>
      {showSuggestions && (suggestions.length > 0 || searching) && (
        <div className="interest-search-textarea__suggestions">
          {searching && (
            <div className="interest-search-textarea__searching">
              <div className="interest-search-textarea__spinner"></div>
              <span>Searching...</span>
            </div>
          )}
          {!searching && suggestions.length > 0 && (
            <>
              {suggestions.map(interest => (
                <button
                  key={interest.id}
                  type="button"
                  className="interest-search-textarea__suggestion"
                  onClick={() => handleSelect(interest)}
                >
                  <div className="interest-search-textarea__suggestion-content">
                    <div className="interest-search-textarea__suggestion-label">{interest.label}</div>
                    <div className="interest-search-textarea__suggestion-subject">{interest.subject.label}</div>
                  </div>
                </button>
              ))}
              {value.trim() && (
                <div className="interest-search-textarea__hint">
                  Press Enter to submit "{value.trim()}"
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
