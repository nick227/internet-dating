import { useAutosaveField, type AutosaveStatus } from './useAutosaveField'

type Props = {
  label: string
  value?: string | null
  placeholder?: string
  type?: 'text' | 'email' | 'date'
  helper?: string
  debounceMs?: number
  onSave: (value: string | null) => Promise<void>
}

export function InlineField({
  label,
  value,
  placeholder,
  type = 'text',
  helper,
  debounceMs,
  onSave,
}: Props) {
  const normalized = value ?? ''
  const { draft, setDraft, status, error, flush } = useAutosaveField({
    value: normalized,
    debounceMs,
    onSave: async nextValue => {
      await onSave(nextValue.length ? nextValue : null)
    },
  })

  return (
    <div className="inlineField">
      <div className="inlineField__labelRow">
        <div className="inlineField__label">{label}</div>
        <InlineStatus status={status} error={error} />
      </div>
      <input
        className="inlineField__input"
        type={type}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        placeholder={placeholder}
        onBlur={flush}
      />
      {helper && <div className="inlineField__hint">{helper}</div>}
    </div>
  )
}

export function InlineStatus({ status, error }: { status: AutosaveStatus; error: string | null }) {
  if (status === 'saving') {
    return (
      <div className="inlineField__status" title="Saving...">
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="inlineField__statusIcon inlineField__statusIcon--spinning"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      </div>
    )
  }
  if (status === 'dirty') {
    return (
      <div className="inlineField__status" title="Editing...">
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="inlineField__statusIcon"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      </div>
    )
  }
  if (status === 'saved') {
    return (
      <div className="inlineField__status" title="Saved">
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="inlineField__statusIcon inlineField__statusIcon--saved"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="inlineField__status inlineField__status--error" title={error ?? 'Error'}>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="inlineField__statusIcon"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
    )
  }
  return <div className="inlineField__status"> </div>
}
