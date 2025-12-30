import { useCallback, useEffect, useRef, useState } from 'react'

export type AutosaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

type Options = {
  value: string
  onSave: (value: string) => Promise<void>
  debounceMs?: number
}

export function useAutosaveField({ value, onSave, debounceMs = 900 }: Options) {
  const [draft, setDraft] = useState(value)
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const lastSaved = useRef(value)
  const skipRef = useRef(true)
  const timeoutRef = useRef<number | null>(null)
  const saveSeq = useRef(0)

  useEffect(() => {
    if (value === lastSaved.current) return
    lastSaved.current = value
    setDraft(value)
    setStatus('idle')
    setError(null)
    skipRef.current = true
  }, [value])

  const runSave = useCallback(
    async (nextValue: string) => {
      const seq = ++saveSeq.current
      setStatus('saving')
      setError(null)
      try {
        await onSave(nextValue)
        if (saveSeq.current !== seq) return
        lastSaved.current = nextValue
        setStatus('saved')
      } catch (err) {
        if (saveSeq.current !== seq) return
        const message = err instanceof Error ? err.message : 'Failed to save'
        setError(message)
        setStatus('error')
      }
    },
    [onSave]
  )

  const scheduleSave = useCallback(
    (nextValue: string, immediate = false) => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      if (immediate) {
        runSave(nextValue)
        return
      }
      timeoutRef.current = window.setTimeout(() => runSave(nextValue), debounceMs)
    },
    [debounceMs, runSave]
  )

  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false
      return
    }
    if (draft === lastSaved.current) {
      setStatus('saved')
      return
    }
    setStatus('dirty')
    scheduleSave(draft)
    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [draft, scheduleSave])

  const flush = useCallback(() => {
    if (draft === lastSaved.current) return
    scheduleSave(draft, true)
  }, [draft, scheduleSave])

  return { draft, setDraft, status, error, flush }
}
