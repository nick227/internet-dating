import { memo, useCallback, useMemo, useState } from 'react'
import type { FeedCard, FeedMedia } from '../../api/types'
import type { WsPresenceStatus } from '@app/shared/ws/contracts'
import { RiverCardHeader } from './RiverCardHeader'
import { RiverCardBody } from './RiverCardBody'
import { CommentWidget } from './CommentWidget'
import { RiverCardEngagement } from './RiverCardEngagement'
import { RiverCardActions } from './RiverCardActions'
import { useRiverCardCommentAdapter } from './useRiverCardState'
import { useFeedSeen } from '../../core/feed/useFeedSeen'

type GridCardProps = {
  card: FeedCard
  onOpenProfile: (userId: string | number) => void
  onToast?: (message: string) => void
  presenceStatus?: WsPresenceStatus | null
  position: number
}

const MAX_GRID_ITEMS = 9
const GRID_COLUMNS = 3

function buildGridItems(media?: FeedMedia[], hero?: string | null): Array<FeedMedia | null> {
  const items = (media ?? []).filter(item => Boolean(item?.url)).slice(0, MAX_GRID_ITEMS)

  if (!items.length && hero) {
    items.push({
      id: `hero-${hero}`,
      type: 'IMAGE',
      url: hero,
      thumbUrl: null,
      width: null,
      height: null,
      durationSec: null,
    })
  }

  const minTiles = Math.max(items.length, GRID_COLUMNS)
  const rowAligned = Math.ceil(minTiles / GRID_COLUMNS) * GRID_COLUMNS
  const tileCount = Math.min(rowAligned, MAX_GRID_ITEMS)

  const padded: Array<FeedMedia | null> = items.slice(0, tileCount)
  while (padded.length < tileCount) {
    padded.push(null)
  }
  return padded
}

function GridCardComponent({
  card,
  onOpenProfile,
  onToast,
  presenceStatus,
  position,
}: GridCardProps) {
  const {
    actorId,
    mergedStats,
    handleRated,
    setAuthoritativeCommentCount,
  } = useRiverCardCommentAdapter(card)

  const [commentOpen, setCommentOpen] = useState(false)
  const isCompositeGrid = Boolean(card.flags?.grid)
  const gridItems = useMemo(
    () => buildGridItems(card.media, card.heroUrl ?? null),
    [card.media, card.heroUrl]
  )
  const { cardRef } = useFeedSeen(card, position)

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

  const title = useMemo(() => {
    const name = card.actor?.name ?? card.content?.title ?? 'Card'
    const age = card.actor?.age
    return age != null ? `${name}, ${age}` : name
  }, [card.actor?.age, card.actor?.name, card.content?.title])

  const presenceLabel = useMemo(() => {
    if (presenceStatus === 'online') return 'Online now'
    if (presenceStatus === 'away') return 'Away'
    if (presenceStatus === 'offline') return 'Offline'
    return null
  }, [presenceStatus])

  const presentation = card.presentation
  const accent = presentation?.accent ?? (card.kind === 'match' ? 'match' : null)

  const handleOpen = useCallback(() => {
    if (!actorId) return
    onOpenProfile(actorId)
  }, [actorId, onOpenProfile])

  return (
    <article
      ref={cardRef}
      className={`grid__view riverCard${commentOpen ? ' riverCard--commentsOpen' : ''}`}
    >
      <div className="riverCard__mediaGrid">
        <div className="riverCard__mediaGridPanel">
          {gridItems.map((item, index) => (
            <div
              key={item?.id ?? `grid-empty-${index}`}
              className={`riverCard__mediaGridTile${item ? '' : ' riverCard__mediaGridTile--empty'}`}
            >
              {item ? (
                <img
                  className="riverCard__mediaGridImage"
                  src={item.thumbUrl ?? item.url}
                  alt=""
                  loading="lazy"
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="riverCard__scrim" />

      <div className="riverCard__meta">
        <div className="u-stack">
          <RiverCardHeader
            actor={card.actor}
            content={card.content}
            kind={card.kind}
            presenceLabel={presenceLabel}
            accent={accent}
            isOptimistic={card.flags?.optimistic}
            onOpenProfile={handleOpen}
          />
          <RiverCardBody content={card.content} />
          {isCompositeGrid ? null : (
            <>
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
            </>
          )}
        </div>
      </div>

      <span className="srOnly">{title}</span>
    </article>
  )
}

export const GridCard = memo(GridCardComponent, (prevProps, nextProps) => {
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
