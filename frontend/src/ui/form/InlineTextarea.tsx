import { useMemo } from 'react'
import { SmartTextarea, type DetectedMedia } from './SmartTextarea'
import { useAutosaveField } from './useAutosaveField'
import { InlineStatus } from './InlineField'

type Props = {
  label: string
  value?: string | null
  placeholder?: string
  helper?: string
  debounceMs?: number
  maxLength?: number
  onSave: (value: string | null) => Promise<void>
  onDetectMedia?: (items: DetectedMedia[]) => void
}

export function InlineTextarea({
  label,
  value,
  placeholder,
  helper,
  debounceMs,
  maxLength,
  onSave,
  onDetectMedia
}: Props) {
  const normalized = useMemo(() => value ?? '', [value])
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
      <SmartTextarea
        value={draft}
        onChange={setDraft}
        placeholder={placeholder}
        maxLength={maxLength}
        onDetectMedia={onDetectMedia}
        replaceOnDetect={false}
        onBlur={flush}
      />
      {helper && <div className="inlineField__hint">{helper}</div>}
    </div>
  )
}
