import { memo, useCallback, useState } from 'react'
import type { FeedCard } from '../../api/types'
import type { WsPresenceStatus } from '@app/shared/ws/contracts'
import { RiverCardFrame } from './RiverCardFrame'
import { RiverCardBody } from './RiverCardBody'
import { CommentWidget } from './CommentWidget'
import { RiverCardEngagement } from './RiverCardEngagement'
import { RiverCardActions } from './RiverCardActions'
import { useRiverCardCommentAdapter } from './useRiverCardState'

type MosaicCardProps = {
  card: FeedCard
  onOpenProfile: (userId: string | number) => void
  onToast?: (message: string) => void
  presenceStatus?: WsPresenceStatus | null
  position: number
}

/**
 * MosaicCard - Smart mosaic display for posts and profiles
 * 
 * Intelligently displays media in a mosaic grid layout:
 * - 1 item: Full-width single display
 * - 2 items: Side-by-side equal split
 * - 3+ items: Smart grid (large primary + 2 thumbnails)
 * 
 * Media selection priority:
 * 1. Videos (most engaging)
 * 2. Images with good aspect ratios
 * 3. Fallback to any available media
 */
function MosaicCardComponent({
  card,
  onOpenProfile,
  onToast,
  presenceStatus,
  position,
}: MosaicCardProps) {
  const {
    actorId,
    mergedStats,
    handleRated,
    setAuthoritativeCommentCount,
  } = useRiverCardCommentAdapter(card)

  const [commentOpen, setCommentOpen] = useState(false)

  const handleToggleComments = useCallback(() => {
    setCommentOpen(prev => !prev)
  }, [])

  const handleCommentPosted = useCallback(
    (authoritativeCount: number | undefined) => {
      if (authoritativeCount !== undefined) {
        setAuthoritativeCommentCount(authoritativeCount)
      }
    },
    [setAuthoritativeCommentCount]
  )

  const handleMentionClick = useCallback(
    (userId: string) => {
      onOpenProfile(userId)
    },
    [onOpenProfile]
  )

  // Force mosaic presentation mode
  const mosaicCard = {
    ...card,
    presentation: {
      ...card.presentation,
      mode: 'mosaic' as const,
    },
  }

  return (
    <RiverCardFrame
      card={mosaicCard}
      presenceStatus={presenceStatus}
      position={position}
      onOpenProfile={onOpenProfile}
      commentWidgetOpen={commentOpen}
    >
      <RiverCardBody content={card.content} />
      <CommentWidget
        postId={card.id}
        initialCommentCount={card.comments?.count ?? mergedStats?.commentCount ?? 0}
        isOpen={commentOpen}
        onToggle={handleToggleComments}
        onMentionClick={handleMentionClick}
        onError={err => onToast?.(err.message)}
        onCommentPosted={handleCommentPosted}
      />
      <RiverCardEngagement stats={mergedStats} />
      <RiverCardActions
        actorId={actorId}
        onToast={onToast}
        initialRating={mergedStats?.myRating ?? null}
        onRated={handleRated}
      />
    </RiverCardFrame>
  )
}

export const MosaicCard = memo(MosaicCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.card.id === nextProps.card.id &&
    prevProps.card.stats === nextProps.card.stats &&
    prevProps.card.comments === nextProps.card.comments &&
    prevProps.card.media === nextProps.card.media &&
    prevProps.position === nextProps.position &&
    prevProps.presenceStatus === nextProps.presenceStatus &&
    prevProps.onOpenProfile === nextProps.onOpenProfile &&
    prevProps.onToast === nextProps.onToast
  )
})
