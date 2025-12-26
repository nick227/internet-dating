import type { CSSProperties } from 'react'

type AvatarSize = 'sm' | 'md' | 'lg'

export function Avatar({ name, size = 'md', src }: { name?: string | null; size?: AvatarSize; src?: string | null }) {
  const label = (name ?? '').trim()
  const initials = getInitials(label)
  const hue = hashToHue(label || 'user')
  const style = { '--avatar-hue': String(hue) } as CSSProperties

  return (
    <div className={`avatar avatar--${size}${src ? ' avatar--image' : ''}`} style={style} aria-hidden="true">
      {src ? <img src={src} alt={label || 'Avatar'} loading="lazy" /> : initials}
    </div>
  )
}

function getInitials(value: string) {
  if (!value) return '?'
  const parts = value.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase()
}

function hashToHue(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360
  }
  return hash
}
