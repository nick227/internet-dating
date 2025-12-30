import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { FeedCardComments } from '../../api/types'
import { commentIntentLabel } from '../../core/format/commentIntentLabel'

type CommentEntry = { id: string; text: string; pending?: boolean }

type RiverCardCommentsInlineProps = {
  comments?: FeedCardComments
  entries: CommentEntry[]
  open: boolean
  onSubmit: (text: string) => Promise<void> | void
  label?: string
}

export function RiverCardCommentsInline({
  comments,
  entries,
  open,
  onSubmit,
  label,
}: RiverCardCommentsInlineProps) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const intentLabel = useMemo(
    () => label ?? commentIntentLabel(comments?.intent),
    [comments?.intent, label]
  )
  const show = open || entries.length > 0
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) {
      setDraft('')
      return
    }
    inputRef.current?.focus()
  }, [open])
  useEffect(() => {
    setDraft('')
  }, [entries])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmed = draft.trim()
      if (!trimmed) return
      setSending(true)
      try {
        await onSubmit(trimmed)
        setDraft('')
      } catch {
        setDraft(trimmed)
      } finally {
        setSending(false)
      }
    },
    [draft, onSubmit]
  )

  if (!show) return null

  return (
    <div className="riverCard__comments" onClick={stopPropagation} onKeyDown={stopPropagation}>
      <div className="riverCard__commentsLabel">{intentLabel}</div>
      {entries.slice(0, 2).map(entry => (
        <div
          key={entry.id}
          className={`riverCard__comment u-clamp-1${entry.pending ? ' riverCard__comment--pending' : ''}`}
        >
          {entry.text}
        </div>
      ))}
      {open && (
        <form className="riverCard__commentComposer" onSubmit={handleSubmit}>
          <input
            className="riverCard__commentInput"
            type="text"
            ref={inputRef}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            placeholder="Write a comment"
            disabled={sending}
          />
          <button className="riverCard__commentSubmit" type="submit" disabled={sending}>
            {sending ? 'Sending' : 'Send'}
          </button>
        </form>
      )}
    </div>
  )
}

function stopPropagation(event: { stopPropagation: () => void }) {
  event.stopPropagation()
}
