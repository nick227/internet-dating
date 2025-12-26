import { useEffect, useState } from 'react'
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

export function InlineChoiceChips<T extends string>({ label, value, options, helper, onSave }: Props<T>) {
  const [current, setCurrent] = useState<T | ''>(value ?? '')
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCurrent(value ?? '')
    setStatus('idle')
    setError(null)
  }, [value])

  const handleSelect = async (next: T) => {
    if (next === current) return
    const previous = current
    setCurrent(next)
    setStatus('saving')
    setError(null)
    try {
      await onSave(next.length ? next : null)
      setStatus('saved')
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
        {options.map((option) => (
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
