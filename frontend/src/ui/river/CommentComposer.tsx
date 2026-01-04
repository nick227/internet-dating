import { useCallback, useEffect, useRef, useState } from 'react'
import { MentionAutocomplete } from './MentionAutocomplete'
import { useKeyboardAwareComposer } from './useKeyboardAwareComposer'

type CommentComposerProps = {
  parentId?: string
  parentAuthorName?: string // For "@username " prefix in replies
  placeholder?: string
  onSubmit: (text: string) => void
  onCancel?: () => void
  disabled?: boolean
}

/**
 * Component for composing comments with @mention support
 * SRP: Handles text input, mention detection, and submission
 */
export function CommentComposer({
  parentId: _parentId,
  parentAuthorName,
  placeholder = 'Write a comment...',
  onSubmit,
  onCancel,
  disabled = false,
}: CommentComposerProps) {
  const [text, setText] = useState('')
  const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [_mentionPosition, setMentionPosition] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { composerRef, keyboardHeight, isKeyboardVisible } = useKeyboardAwareComposer()

  // Initialize with parent mention if replying
  useEffect(() => {
    if (parentAuthorName && !text) {
      setText(`@${parentAuthorName} `)
      // Focus and move cursor to end
      setTimeout(() => {
        inputRef.current?.focus()
        const len = inputRef.current?.value.length ?? 0
        inputRef.current?.setSelectionRange(len, len)
      }, 0)
    }
  }, [parentAuthorName, text])

  // Handle text input and detect @mentions
  const handleInput = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value
    setText(value)

    // Detect @mention pattern
    const cursorPos = event.target.selectionStart
    const textBeforeCursor = value.slice(0, cursorPos)
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/)

    if (mentionMatch) {
      const query = mentionMatch[1]
      setMentionQuery(query)
      setMentionPosition(cursorPos)
      setShowMentionAutocomplete(true)
    } else {
      setShowMentionAutocomplete(false)
    }
  }, [])

  // Handle mention selection
  const handleMentionSelect = useCallback(
    (userId: string, username: string) => {
      if (!inputRef.current) return

      const cursorPos = inputRef.current.selectionStart
      const textBeforeCursor = text.slice(0, cursorPos)
      const mentionMatch = textBeforeCursor.match(/@(\w*)$/)

      if (mentionMatch) {
        const startPos = cursorPos - mentionMatch[0].length
        const newText = text.slice(0, startPos) + `@${username} ` + text.slice(cursorPos)
        setText(newText)
        setShowMentionAutocomplete(false)

        // Focus and position cursor after mention
        setTimeout(() => {
          inputRef.current?.focus()
          const newPos = startPos + `@${username} `.length
          inputRef.current?.setSelectionRange(newPos, newPos)
        }, 0)
      }
    },
    [text]
  )

  // Handle submit
  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      const trimmed = text.trim()
      console.log('[CommentComposer] handleSubmit called', { trimmed, hasText: !!trimmed, disabled })
      if (!trimmed || disabled) {
        console.log('[CommentComposer] Returning early - no text or disabled')
        return
      }

      console.log('[CommentComposer] Calling onSubmit with:', trimmed)
      onSubmit(trimmed)
      setText('')
      setShowMentionAutocomplete(false)
      console.log('[CommentComposer] onSubmit called, text cleared')
    },
    [text, disabled, onSubmit]
  )

  // Handle cancel
  const handleCancel = useCallback(() => {
    setText('')
    setShowMentionAutocomplete(false)
    onCancel?.()
  }, [onCancel])

  // Close autocomplete on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowMentionAutocomplete(false)
      }
    }

    if (showMentionAutocomplete) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMentionAutocomplete])

  // Merge refs
  useEffect(() => {
    if (composerRef.current && containerRef.current) {
      composerRef.current = containerRef.current
    }
  }, [composerRef])

  return (
    <div
      className="commentComposer"
      ref={containerRef}
      style={{
        paddingBottom: isKeyboardVisible ? `calc(var(--s-3) + ${keyboardHeight}px + env(safe-area-inset-bottom, 0px))` : undefined,
        transition: 'padding-bottom 0.25s ease-out',
      }}
    >
      <form onSubmit={handleSubmit} className="commentComposer__form">
        <div className="commentComposer__inputWrapper">
          <textarea
            ref={inputRef}
            className="commentComposer__input"
            value={text}
            onChange={handleInput}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setShowMentionAutocomplete(false)
                if (onCancel) {
                  e.preventDefault()
                  handleCancel()
                }
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            style={{
              minHeight: '44px', // Touch-friendly
              maxHeight: '120px',
              resize: 'none',
            }}
          />
          {showMentionAutocomplete && (
            <MentionAutocomplete
              query={mentionQuery}
              containerRef={containerRef}
              onSelect={handleMentionSelect}
              onClose={() => setShowMentionAutocomplete(false)}
            />
          )}
        </div>
        <div className="commentComposer__actions">
          {onCancel && (
            <button
              type="button"
              className="commentComposer__cancel"
              onClick={handleCancel}
              disabled={disabled}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="commentComposer__submit"
            disabled={disabled || !text.trim()}
          >
            {disabled ? 'Sending...' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  )
}
