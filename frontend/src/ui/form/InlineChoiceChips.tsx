import { useEffect, useState, useRef } from 'react'
import { InlineStatus } from './InlineField'
import type { AutosaveStatus } from './useAutosaveField'

type Option<T extends string> = { value: T; label: string }

type Props<T extends string> = {
  label: string
  value?: T | null
  options: Option<T>[]
  helper?: string
  onSave: (value: T | null) => Promise<void>
}

export function InlineChoiceChips<T extends string>({
  label,
  value,
  options,
  helper,
  onSave,
}: Props<T>) {
  const [current, setCurrent] = useState<T | ''>(value ?? '')
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const savedValueRef = useRef<T | ''>(value ?? '')

  useEffect(() => {
    const propValue = (value ?? '') as T | ''
    
    // Skip sync if prop is empty and we have a value (parent is refetching)
    if (propValue === '' && current !== '') {
      return // Preserve current value during refetch
    }
    
    // If prop value matches current, we're in sync - just update status if needed
    if (propValue === current) {
      if (status === 'saved') {
        // Prop confirmed our save, go to idle
        setStatus('idle')
        savedValueRef.current = propValue
      }
      return
    }
    
    // Prop value is different from current - need to sync
    if (status === 'idle' || status === 'error') {
      // No pending changes, sync immediately
      setCurrent(propValue)
      setStatus('idle')
      setError(null)
      savedValueRef.current = propValue
    } else if (status === 'saved') {
      // We have a pending save
      if (propValue === savedValueRef.current) {
        // Prop has caught up with our save - confirm it
        setCurrent(propValue)
        setStatus('idle')
      } else {
        // Prop has a different value - server may have sent different data
        // Accept the server value
        setCurrent(propValue)
        setStatus('idle')
        savedValueRef.current = propValue
      }
    }
  }, [value, current, status])

  const handleSelect = async (next: T) => {
    if (next === current) return
    const previous = current
    setCurrent(next)
    setStatus('saving')
    setError(null)
    try {
      await onSave(next.length ? next : null)
      setStatus('saved')
      savedValueRef.current = next
      // Keep optimistic update - useEffect will sync when prop updates
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save'
      setStatus('error')
      setError(message)
      setCurrent(previous)
    }
  }

  return (
    <div className="inlineField">
      <div className="inlineField__labelRow">
        <div className="inlineField__label">{label}</div>
        <InlineStatus status={status} error={error} />
      </div>
      <div className="inlineChips">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            className={`inlineChip${current === option.value ? ' inlineChip--active' : ''}`}
            aria-pressed={current === option.value}
            onClick={() => handleSelect(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {helper && <div className="inlineField__hint">{helper}</div>}
    </div>
  )
}
