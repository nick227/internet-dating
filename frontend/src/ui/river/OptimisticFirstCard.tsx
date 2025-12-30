import { useState } from 'react'
import type { FeedCard } from '../../api/types'

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

/**
 * OptimisticFirstCard - Renders first card layout immediately
 * Shows real structure (not skeleton) even before data loads
 * Goal: Fast feedback, "there's content here"
 * 
 * Algorithmic UX Trick: Pre-seed optimistic text
 * Even fake copy feels intentional. If real data arrives fast, user never notices.
 * Perception > reality.
 */
export function OptimisticFirstCard() {
  return (
    <article className="riverCard" data-no-hydrate="true">
      {/* Media frame - fixed aspect ratio, empty until loaded */}
      <div className="riverCard__media" />
      <div className="riverCard__scrim" />
      
      {/* Meta container - fixed position */}
      <div className="riverCard__meta">
        <div className="u-stack">
          {/* Header placeholder - pre-seeded optimistic text */}
          <div className="riverCard__name">
            <h2 style={{ margin: 0, fontSize: '28px', lineHeight: 1.15, color: 'rgba(255,255,255,0.92)' }}>
              <span style={{ opacity: 0.3 }}>Someone nearby posted...</span>
            </h2>
          </div>
          
          {/* Text block placeholder - pre-seeded optimistic text */}
          <div style={{ 
            color: 'rgba(255,255,255,0.84)', 
            fontSize: '16px', 
            lineHeight: 1.35,
            minHeight: '60px',
            opacity: 0.3
          }}>
            New content is loading...
          </div>
        </div>
      </div>
    </article>
  )
}

/**
 * FirstCardShell - Renders first card with real data but minimal hydration
 * Used when Phase 1 (lite) data arrives
 * 
 * CRITICAL: Never eager-load media, even images, on first card
 * Let Phase-2 hydrate media only after Phase-1 paint
 * This keeps LCP stable and predictable
 */
export function FirstCardShell({ card }: { card: FeedCard }) {
  const actorName = card.actor?.name ?? 'User'
  const actorAvatar = card.actor?.avatarUrl
  // Prefer server-side truncated textPreview if available
  const text = card.content?.body ?? ''
  const truncatedText = text.length > 150 ? text.slice(0, 150) + '...' : text
  const [avatarError, setAvatarError] = useState(false)
  const initials = getInitials(actorName)

  return (
    <article className="riverCard">
      {/* Media frame - ALWAYS empty in Phase 1, will load in Phase 2 */}
      {/* Never eager-load media, even images, on first card */}
      <div className="riverCard__media" />
      <div className="riverCard__scrim" />
      
      {/* Meta with real data - only avatar + name + text */}
      <div className="riverCard__meta">
        <div className="u-stack">
          {/* Header with real name and avatar - ONLY eager-loaded elements */}
          <div className="riverCard__name" style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            {/* Avatar with instant fallback to initials on error */}
            {/* Avatar decode optimization: force decode off main thread, use power-of-two sizes */}
            <div
              style={{
                width: '64px',  // Power-of-two: 64×64 (faster GPU upload)
                height: '64px',
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.2)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(168, 85, 247, 0.3)',
                color: 'rgba(255,255,255,0.92)',
                fontSize: '18px',
                fontWeight: 600,
              }}
            >
              {actorAvatar && !avatarError ? (
                <img
                  src={actorAvatar}
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    objectFit: 'cover',
                  }}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"  // Force decode off main thread
                  onError={() => {
                    // Instant fallback to initials - don't block Phase-1
                    setAvatarError(true)
                  }}
                />
              ) : (
                initials
              )}
            </div>
            <h2 style={{ margin: 0, fontSize: '28px', lineHeight: 1.15, color: 'rgba(255,255,255,0.92)' }}>
              {actorName}
            </h2>
          </div>
          
          {/* Text block - real content, server-side truncated preferred */}
          <div style={{ 
            color: 'rgba(255,255,255,0.84)', 
            fontSize: '16px', 
            lineHeight: 1.35,
            minHeight: '60px'
          }}>
            {truncatedText || 'No content'}
          </div>
        </div>
      </div>
    </article>
  )
}
