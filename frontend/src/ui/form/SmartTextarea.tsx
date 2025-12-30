import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageHelpers } from './MessageHelpers'

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
  messageSuggestions?: string[]
  onSuggestionSelect?: (message: string) => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
  className?: string
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
  onBlur,
  messageSuggestions = [],
  onSuggestionSelect,
  onKeyDown,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const lastValue = useRef(value)
  const [isFocused, setIsFocused] = useState(false)

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
    if (text === lastValue.current) return
    lastValue.current = text
    onChange(text)
  }

  const detectMedia = () => {
    const text = ref.current?.innerText ?? ''
    if (!text || !onDetectMedia) return
    const matches = text.match(URL_REGEX) ?? []
    const detected = matches.map(url => classifyUrl(url)).filter(Boolean) as DetectedMedia[]
    if (!detected.length) return
    onDetectMedia(detected)
    if (replaceOnDetect) {
      const replaceSet = new Set(detected.map(item => item.url))
      const cleaned = text
        .replace(URL_REGEX, url => (replaceSet.has(url) ? '' : url))
        .replace(/\s{2,}/g, ' ')
        .trim()
      if (cleaned !== text) {
        lastValue.current = cleaned
        if (ref.current) ref.current.innerText = cleaned
        onChange(cleaned)
      }
    }
  }

  const handleFocus = () => {
    setIsFocused(true)
  }

  const handleBlur = () => {
    setIsFocused(false)
    emitChange()
    detectMedia()
    onBlur?.()
  }

  const handleSuggestionSelect = (message: string) => {
    if (onSuggestionSelect) {
      onSuggestionSelect(message)
    } else {
      onChange(message)
      if (ref.current) {
        ref.current.innerText = message
        lastValue.current = message
      }
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (maxLength != null) {
      const text = ref.current?.innerText ?? ''
      if (text.length >= maxLength && event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        return
      }
    }
    onKeyDown?.(event)
  }

  return (
    <div
      className={`smartTextarea${disabled ? ' smartTextarea--disabled' : ''}${className ? ` ${className}` : ''}`}
    >
      {messageSuggestions.length > 0 && (
        <MessageHelpers
          suggestions={messageSuggestions}
          onSelect={handleSuggestionSelect}
          visible={isFocused && value.trim().length === 0}
        />
      )}
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
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPaste={event => {
          event.preventDefault()
          const text = event.clipboardData.getData('text/plain')
          document.execCommand('insertText', false, text)
        }}
        onKeyDown={handleKeyDown}
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
