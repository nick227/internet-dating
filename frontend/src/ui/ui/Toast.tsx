import { useEffect } from 'react'

export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onClose, 2200)
    return () => clearTimeout(t)
  }, [message, onClose])

  if (!message) return null

  return (
    <div
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
