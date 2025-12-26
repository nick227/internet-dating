import { useEffect, useMemo, useRef } from 'react'

export type DetectedMedia = {
  kind: 'youtube' | 'image'
  url: string
}

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  maxLength?: number
  onDetectMedia?: (items: DetectedMedia[]) => void
  replaceOnDetect?: boolean
  onBlur?: () => void
}

const URL_REGEX = /\bhttps?:\/\/[^\s]+/gi

export function SmartTextarea({
  value,
  onChange,
  placeholder,
  disabled,
  maxLength,
  onDetectMedia,
  replaceOnDetect = false,
  onBlur
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const lastValue = useRef(value)

  useEffect(() => {
    if (!ref.current) return
    if (ref.current.innerText !== value) {
      ref.current.innerText = value
    }
    lastValue.current = value
  }, [value])

  const placeholderText = useMemo(() => placeholder ?? 'Write something...', [placeholder])

  const emitChange = () => {
    const text = ref.current?.innerText ?? ''
    lastValue.current = text
    onChange(text)
  }

  const detectMedia = () => {
    const text = ref.current?.innerText ?? ''
    if (!text || !onDetectMedia) return
    const matches = text.match(URL_REGEX) ?? []
    const detected = matches.map((url) => classifyUrl(url)).filter(Boolean) as DetectedMedia[]
    if (!detected.length) return
    onDetectMedia(detected)
    if (replaceOnDetect) {
      const replaceSet = new Set(detected.map((item) => item.url))
      const cleaned = text.replace(URL_REGEX, (url) => (replaceSet.has(url) ? '' : url)).replace(/\s{2,}/g, ' ').trim()
      if (cleaned !== text) {
        lastValue.current = cleaned
        if (ref.current) ref.current.innerText = cleaned
        onChange(cleaned)
      }
    }
  }

  return (
    <div className={`smartTextarea${disabled ? ' smartTextarea--disabled' : ''}`}>
      <div
        ref={ref}
        className="smartTextarea__input"
        contentEditable={!disabled}
        data-placeholder={placeholderText}
        aria-label={placeholderText}
        role="textbox"
        aria-multiline="true"
        spellCheck
        suppressContentEditableWarning
        onInput={emitChange}
        onBlur={() => {
          emitChange()
          detectMedia()
          onBlur?.()
        }}
        onPaste={(event) => {
          event.preventDefault()
          const text = event.clipboardData.getData('text/plain')
          document.execCommand('insertText', false, text)
        }}
        onKeyDown={(event) => {
          if (maxLength == null) return
          const text = ref.current?.innerText ?? ''
          if (text.length >= maxLength && event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
            event.preventDefault()
          }
        }}
      />
      {maxLength != null && (
        <div className="smartTextarea__counter">
          {value.length}/{maxLength}
        </div>
      )}
    </div>
  )
}

function classifyUrl(url: string): DetectedMedia | null {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    if (host === 'youtube.com' || host === 'youtu.be') {
      return { kind: 'youtube', url }
    }
    const ext = parsed.pathname.split('.').pop()?.toLowerCase()
    if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      return { kind: 'image', url }
    }
  } catch {
    return null
  }
  return null
}
