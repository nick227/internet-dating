import { useCallback, useEffect, useRef, useState } from 'react'
import { useModalKeyboard } from '../../core/hooks/useModalKeyboard'

type FullScreenModalProps = {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: React.ReactNode
  closeButtonLabel?: string
  showCloseButton?: boolean
  className?: string
}

export function FullScreenModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  closeButtonLabel = 'Close',
  showCloseButton = true,
  className = '',
}: FullScreenModalProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [translateY, setTranslateY] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef<number>(0)
  const isDraggingRef = useRef(false)
  const translateYRef = useRef<number>(0)
  const timeoutRef = useRef<number>()

  useModalKeyboard(open, onClose)

  useEffect(() => {
    if (open) {
      setIsVisible(true)
      setTranslateY(0)
      translateYRef.current = 0
      document.body.style.overflow = 'hidden'
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    } else {
      setIsVisible(false)
      setTranslateY(0)
      translateYRef.current = 0
      timeoutRef.current = window.setTimeout(() => {
        document.body.style.overflow = ''
      }, 300)
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      document.body.style.overflow = ''
    }
  }, [open])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return

    const target = e.target as HTMLElement
    if (target.closest('button, a, input, textarea, [role="button"]')) return

    const panel = panelRef.current
    if (!panel) return

    const scrollable = panel.querySelector('[data-scrollable]') as HTMLElement
    if (scrollable) {
      const isAtTop = scrollable.scrollTop <= 0
      if (!isAtTop) return
    }

    const handle = handleRef.current
    const isHandleClick = handle && (handle.contains(target) || target === handle)

    if (!isHandleClick && target !== panel && !panel.contains(target)) return

    startYRef.current = e.clientY
    isDraggingRef.current = true
    if (panel) {
      panel.style.transition = 'none'
    }
    e.preventDefault()
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return

    const deltaY = e.clientY - startYRef.current
    if (deltaY < 0) {
      setTranslateY(0)
      translateYRef.current = 0
      return
    }

    setTranslateY(deltaY)
    translateYRef.current = deltaY
    e.preventDefault()
  }, [])

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return

    isDraggingRef.current = false
    const panel = panelRef.current
    if (!panel) return

    panel.style.transition = ''

    const threshold = 100
    const currentTranslateY = translateYRef.current
    if (currentTranslateY > threshold) {
      onClose()
    } else {
      setTranslateY(0)
      translateYRef.current = 0
    }
  }, [onClose])

  if (!open && !isVisible) return null

  const panelStyle = translateY > 0 ? { transform: `translateY(${translateY}px)` } : undefined

  return (
    <div
      className={`fullScreenModal ${open ? 'fullScreenModal--open' : 'fullScreenModal--closing'} ${className}`}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Modal'}
    >
      <div className="fullScreenModal__backdrop" onClick={onClose} />
      <div
        ref={panelRef}
        className="fullScreenModal__panel"
        style={panelStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div ref={handleRef} className="fullScreenModal__handle" />
        <div className="fullScreenModal__content">
          {(title || subtitle) && (
            <div className="fullScreenModal__header">
              {title && <div className="fullScreenModal__title">{title}</div>}
              {subtitle && <div className="fullScreenModal__subtitle u-muted">{subtitle}</div>}
            </div>
          )}
          <div className="fullScreenModal__body">{children}</div>
          {showCloseButton && (
            <div className="fullScreenModal__actions">
              <button className="actionBtn actionBtn--nope" type="button" onClick={onClose}>
                {closeButtonLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
