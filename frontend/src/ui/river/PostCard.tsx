import { memo, useCallback } from 'react'
import type { FeedCard } from '../../api/types'
import type { WsPresenceStatus } from '@app/shared/ws/contracts'
import { RiverCardFrame } from './RiverCardFrame'
import { RiverCardBody } from './RiverCardBody'
import { RiverCardCommentsInline } from './RiverCardCommentsInline'
import { RiverCardEngagement } from './RiverCardEngagement'
import { RiverCardActions } from './RiverCardActions'
import { useRiverCardState } from './useRiverCardState'

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
    commentLabel,
    commentEntries,
    commentOpen,
    mergedStats,
    toggleComment,
    submitComment,
    handleRated,
  } = useRiverCardState(card)

  const handleSubmitComment = useCallback(
    (text: string) => {
      submitComment(text).catch(() => {
        onToast?.('Comment failed')
      })
    },
    [submitComment, onToast]
  )

  return (
    <RiverCardFrame
      card={card}
      presenceStatus={presenceStatus}
      position={position}
      onOpenProfile={onOpenProfile}
    >
      <RiverCardBody content={card.content} />
      <RiverCardCommentsInline
        comments={card.comments}
        entries={commentEntries}
        open={commentOpen}
        onSubmit={handleSubmitComment}
        label={commentLabel}
      />
      <RiverCardEngagement stats={mergedStats} />
      <RiverCardActions
        actorId={actorId}
        onToast={onToast}
        initialRating={mergedStats?.myRating ?? null}
        onRated={handleRated}
        onComment={toggleComment}
        commentLabel={commentLabel}
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
