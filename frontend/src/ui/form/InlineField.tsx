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
  onSave
}: Props) {
  const normalized = value ?? ''
  const { draft, setDraft, status, error, flush } = useAutosaveField({
    value: normalized,
    debounceMs,
    onSave: async (nextValue) => {
      await onSave(nextValue.length ? nextValue : null)
    }
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
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        onBlur={flush}
      />
      {helper && <div className="inlineField__hint">{helper}</div>}
    </div>
  )
}

export function InlineStatus({ status, error }: { status: AutosaveStatus; error: string | null }) {
  if (status === 'saving') return <div className="inlineField__status">Saving...</div>
  if (status === 'dirty') return <div className="inlineField__status">Editing...</div>
  if (status === 'saved') return <div className="inlineField__status">Saved</div>
  if (status === 'error') return <div className="inlineField__status inlineField__status--error">{error ?? 'Error'}</div>
  return <div className="inlineField__status"> </div>
}
