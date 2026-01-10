import type { FeedMedia } from '../../api/types'

/**
 * Smart media selection for mosaic display
 * Prioritizes engaging content and optimal layouts
 */

type MediaScore = {
  media: FeedMedia
  score: number
}

/**
 * Score media items for mosaic display priority
 * Higher scores = better for mosaic display
 */
function scoreMediaForMosaic(media: FeedMedia): number {
  let score = 0

  // Videos are most engaging (high priority)
  if (media.type === 'VIDEO') {
    score += 100
    // Short videos (< 30s) are better for mosaic
    if (media.durationSec && media.durationSec < 30) {
      score += 20
    }
  } else if (media.type === 'IMAGE') {
    score += 50
  } else if (media.type === 'EMBED') {
    score += 40
  }

  // Prefer media with dimensions (better quality indicator)
  if (media.width && media.height) {
    score += 10

    // Prefer square or portrait for mosaic grid
    const aspectRatio = media.width / media.height
    if (aspectRatio >= 0.75 && aspectRatio <= 1.25) {
      // Square-ish (good for mosaic)
      score += 15
    } else if (aspectRatio < 0.75) {
      // Portrait (good for primary slot)
      score += 10
    }
  }

  // Prefer media with thumbnails (faster loading)
  if (media.thumbUrl) {
    score += 5
  }

  return score
}

/**
 * Select best media items for mosaic display
 * Returns up to 3 items optimized for the grid layout
 */
export function selectMosaicMedia(media: FeedMedia[] | undefined, maxItems = 3): FeedMedia[] {
  if (!media || media.length === 0) return []

  // Filter valid media
  const validMedia = media.filter(item => Boolean(item?.url))
  if (validMedia.length === 0) return []

  // If we have exactly what we need or less, return as-is
  if (validMedia.length <= maxItems) return validMedia

  // Score and sort media by priority
  const scored: MediaScore[] = validMedia.map(item => ({
    media: item,
    score: scoreMediaForMosaic(item),
  }))

  // Sort by score (highest first)
  scored.sort((a, b) => b.score - a.score)

  // Select top items
  return scored.slice(0, maxItems).map(item => item.media)
}

/**
 * Optimize media order for mosaic grid layout
 * Places best item in primary slot (a), supporting items in b/c
 */
export function optimizeMosaicLayout(media: FeedMedia[]): FeedMedia[] {
  if (media.length <= 1) return media

  const scored: MediaScore[] = media.map(item => ({
    media: item,
    score: scoreMediaForMosaic(item),
  }))

  // Sort by score
  scored.sort((a, b) => b.score - a.score)

  if (media.length === 2) {
    // For 2 items: highest score on left (a), second on right (b)
    return [scored[0].media, scored[1].media]
  }

  // For 3+ items: highest score in primary (a), next two in b/c
  return scored.slice(0, 3).map(item => item.media)
}

/**
 * Check if media set is good for mosaic display
 * Returns true if media is suitable for mosaic mode
 */
export function isMosaicWorthy(media: FeedMedia[] | undefined): boolean {
  if (!media || media.length === 0) return false

  const validMedia = media.filter(item => Boolean(item?.url))
  
  // Need at least 2 items for meaningful mosaic
  if (validMedia.length < 2) return false

  // Check if we have at least one high-quality item
  return validMedia.some(item => {
    const score = scoreMediaForMosaic(item)
    return score >= 60 // Threshold for "good" media
  })
}
