import type { CSSProperties } from 'react'
import { Media } from './Media'

type AvatarSize = 'sm' | 'md' | 'lg'

export function Avatar({
  name,
  size = 'md',
  src,
  profileId,
  onClick,
  className,
}: {
  name?: string | null
  size?: AvatarSize
  src?: string | null
  profileId?: string | null
  onClick?: (e: React.MouseEvent) => void
  className?: string
}) {
  const label = (name ?? '').trim()
  const initials = getInitials(label)
  const hue = hashToHue(label || 'user')
  const style = { '--avatar-hue': String(hue) } as CSSProperties

  const baseClass = `avatar avatar--${size}${src ? ' avatar--image' : ''}`
  const finalClass = className ? `${baseClass} ${className}` : baseClass

  // If onClick is provided, don't wrap in anchor (parent handles click)
  // Pass onClick to Media to prevent it from opening viewer, but Media stops propagation
  // So we handle the click on Avatar's div by calling onClick directly in Media's handler
  const handleMediaClick = onClick ? () => {
    // Call Avatar's onClick handler directly since Media stops propagation
    onClick({} as React.MouseEvent)
  } : undefined

  const mediaContent = src ? (
    <Media 
      src={src} 
      alt={label || 'Avatar'} 
      className="avatar__img"
      onClick={handleMediaClick}
    />
  ) : initials

  // If onClick is provided, don't wrap in anchor (parent handles click)
  // If profileId is provided and no onClick, wrap in anchor for navigation
  if (onClick) {
    return (
      <div
        className={finalClass}
        style={style}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick(e as unknown as React.MouseEvent)
          }
        }}
        aria-label={profileId ? `View ${label}'s profile` : undefined}
      >
        {mediaContent}
      </div>
    )
  }

  if (profileId) {
    return (
      <div
        className={finalClass}
        style={style}
        aria-hidden="true"
      >
        <a href={`/profiles/${profileId}`} onClick={(e) => e.stopPropagation()}>
          {mediaContent}
        </a>
      </div>
    )
  }

  return (  
    <div
      className={finalClass}
      style={style}
      aria-hidden="true"
    >
      {mediaContent}
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
