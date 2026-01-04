const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export function formatConnectionTimestamp(value?: string | Date | null) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''

  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 0) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  if (diff < MINUTE_MS) return 'Just now'
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}m ago`
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`

  const dayDiff = Math.floor(diff / DAY_MS)
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff < 7) return `${dayDiff}d ago`

  const year = now.getFullYear() === d.getFullYear() ? undefined : 'numeric'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year })
}
