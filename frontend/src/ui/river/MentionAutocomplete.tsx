import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { searchUsers } from '../../api/comments'
import { useDebounce } from '../../core/hooks/useDebounce'

type MentionAutocompleteProps = {
  query: string
  containerRef?: React.RefObject<HTMLElement> // Anchor to container instead of cursor
  onSelect: (userId: string, username: string) => void
  onClose: () => void
}

/**
 * Component for @mention autocomplete dropdown
 * SRP: Shows user suggestions when typing @
 */
export function MentionAutocomplete({ query, containerRef, onSelect, onClose }: MentionAutocompleteProps) {
  const [users, setUsers] = useState<Array<{ id: string; name: string; displayName: string; avatarUrl?: string }>>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const debouncedQuery = useDebounce(query, 300)

  // Search users when query changes
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setUsers([])
      setSelectedIndex(0)
      return
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)

    searchUsers(debouncedQuery, 10, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return
        setUsers(result.users)
        setSelectedIndex(0)
      })
      .catch(error => {
        if (controller.signal.aborted || error.name === 'AbortError') return
        console.error('Failed to search users:', error)
        setUsers([])
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [debouncedQuery])

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (users.length === 0) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex(prev => (prev + 1) % users.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex(prev => (prev - 1 + users.length) % users.length)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const selected = users[selectedIndex]
        if (selected) {
          onSelect(selected.id, selected.displayName || selected.name)
        }
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    if (users.length > 0) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [users, selectedIndex, onSelect, onClose])

  if (!debouncedQuery || debouncedQuery.length < 2 || (users.length === 0 && !loading)) {
    return null
  }

  // Anchor to container instead of cursor position (more reliable on mobile)
  return (
    <div className="mentionAutocomplete">
      {loading ? (
        <div className="mentionAutocomplete__loading">Searching...</div>
      ) : users.length === 0 ? (
        <div className="mentionAutocomplete__empty">No users found</div>
      ) : (
        <ul className="mentionAutocomplete__list" role="listbox">
          {users.map((user, index) => (
            <li
              key={user.id}
              className={`mentionAutocomplete__item ${index === selectedIndex ? 'mentionAutocomplete__item--selected' : ''}`}
              role="option"
              aria-selected={index === selectedIndex}
              onMouseEnter={() => setSelectedIndex(index)}
              onMouseDown={e => {
                e.preventDefault()
                onSelect(user.id, user.displayName || user.name)
              }}
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="mentionAutocomplete__avatar" />
              ) : (
                <div className="mentionAutocomplete__avatar mentionAutocomplete__avatar--placeholder">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="mentionAutocomplete__name">{user.displayName || user.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
