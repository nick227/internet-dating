import { useEffect } from 'react'

type ToastRole = 'status' | 'alert'

export function Toast({
  message,
  onClose,
  durationMs = 2200,
  role = 'status',
}: {
  message: string | null
  onClose: () => void
  durationMs?: number
  role?: ToastRole
}) {
  useEffect(() => {
    if (!message) return
    if (durationMs <= 0) return
    const t = setTimeout(onClose, durationMs)
    return () => clearTimeout(t)
  }, [durationMs, message, onClose])

  if (!message) return null

  return (
    <div
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      aria-atomic="true"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: '14px',
        paddingTop: 'var(--safe-top)',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div className="u-glass" style={{ padding: '10px 12px', borderRadius: '999px' }}>
        <span style={{ fontSize: 'var(--fs-2)', color: 'var(--muted)' }}>{message}</span>
      </div>
    </div>
  )
}
