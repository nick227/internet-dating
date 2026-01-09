import { memo, useState, useCallback, useEffect, useRef } from 'react'
import type { FeedCard } from '../../api/types'
import type { WsPresenceStatus } from '@app/shared/ws/contracts'
import { RiverCardFrame } from './RiverCardFrame'
import { RiverCardBody } from './RiverCardBody'
import { CommentWidget } from './CommentWidget'
import { RiverCardEngagement } from './RiverCardEngagement'
import { RiverCardActions } from './RiverCardActions'
import { useRiverCardCommentAdapter } from './useRiverCardState'

type ProfileCardProps = {
  card: FeedCard
  onOpenProfile: (userId: string | number) => void
  onToast?: (message: string) => void
  presenceStatus?: WsPresenceStatus | null
  position: number
}

function ProfileCardComponent({
  card,
  onOpenProfile,
  onToast,
  presenceStatus,
  position,
}: ProfileCardProps) {
  const {
    actorId,
    mergedStats,
    handleRated,
    setAuthoritativeCommentCount,
  } = useRiverCardCommentAdapter(card)
  const [isHiding, setIsHiding] = useState(false)
  const [commentOpen, setCommentOpen] = useState(false)
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>()

  // Cleanup timeout on unmount to prevent state updates after unmount
  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current)
      }
    }
  }, [])

  const handleNotInterested = useCallback(() => {
    if (isHiding) return
    setIsHiding(true)
    window.dispatchEvent(
      new CustomEvent('feed:hide', {
        detail: {
          itemType: card.kind,
          itemId: card.id,
        },
      })
    )
    onToast?.('Profile hidden')
    // Reset after brief delay to prevent spam clicking
    // Clear any existing timeout before setting a new one
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current)
    }
    resetTimeoutRef.current = setTimeout(() => {
      setIsHiding(false)
      resetTimeoutRef.current = undefined
    }, 1000)
  }, [isHiding, card.kind, card.id, onToast])

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

export const ProfileCard = memo(ProfileCardComponent, (prevProps, nextProps) => {
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
