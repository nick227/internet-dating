import { memo, useCallback, useState } from 'react'
import type { FeedCard } from '../../api/types'
import type { WsPresenceStatus } from '@app/shared/ws/contracts'
import { RiverCardFrame } from './RiverCardFrame'
import { RiverCardBody } from './RiverCardBody'
import { CommentWidget } from './CommentWidget'
import { RiverCardEngagement } from './RiverCardEngagement'
import { RiverCardActions } from './RiverCardActions'
import { useRiverCardCommentAdapter } from './useRiverCardState'

type PostCardProps = {
  card: FeedCard
  onOpenProfile: (userId: string | number) => void
  onToast?: (message: string) => void
  presenceStatus?: WsPresenceStatus | null
  position: number
}

function PostCardComponent({
  card,
  onOpenProfile,
  onToast,
  presenceStatus,
  position,
}: PostCardProps) {
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

  // Adapter: Bridges authoritative count from widget (single writer) to card (read-only display)
  // Card state is READ-ONLY - only updates via setAuthoritativeCommentCount (enforced)
  // Widget owns all mutations - this adapter just syncs the count
  const handleCommentPosted = useCallback(
    (authoritativeCount: number | undefined) => {
      // Use adapter method (enforces single-writer pattern)
      // If undefined, keep current count (will update on feed refresh)
      if (authoritativeCount !== undefined) {
        setAuthoritativeCommentCount(authoritativeCount)
      }
    },
    [setAuthoritativeCommentCount]
  )
  
  // TODO Phase 1: Add handlers for other mutation events
  // const handleCommentRemoved = useCallback((authoritativeCount: number) => {
  //   setAuthoritativeCommentCount(authoritativeCount)
  // })
  // const handleCommentHidden = useCallback((authoritativeCount: number) => {
  //   setAuthoritativeCommentCount(authoritativeCount)
  // })

  const handleMentionClick = useCallback(
    (userId: string) => {
      onOpenProfile(userId)
    },
    [onOpenProfile]
  )

  return (
    <RiverCardFrame
      card={card}
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

export const PostCard = memo(PostCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.card.id === nextProps.card.id &&
    prevProps.card.stats === nextProps.card.stats &&
    prevProps.card.comments === nextProps.card.comments &&
    prevProps.position === nextProps.position &&
    prevProps.presenceStatus === nextProps.presenceStatus &&
    prevProps.onOpenProfile === nextProps.onOpenProfile &&
    prevProps.onToast === nextProps.onToast
  )
})
