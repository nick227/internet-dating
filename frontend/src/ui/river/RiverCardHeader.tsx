import { useMemo } from 'react'
import type {
  FeedCardActor,
  FeedCardContent,
  FeedCardKind,
  FeedCardPresentation,
} from '../../api/types'
import { prettyIntent } from '../../core/format/prettyIntent'
import { Pill } from '../ui/Pill'
import { Avatar } from '../ui/Avatar'

type RiverCardHeaderProps = {
  actor?: FeedCardActor
  content?: FeedCardContent
  kind: FeedCardKind
  presenceLabel?: string | null
  accent?: FeedCardPresentation['accent']
  isOptimistic?: boolean
}

export function RiverCardHeader({
  actor,
  content,
  kind,
  presenceLabel,
  accent,
  isOptimistic,
}: RiverCardHeaderProps) {
  const name = actor?.name ?? content?.title ?? 'Untitled'
  const age = actor?.age
  const createdAt = content?.createdAt
  const compatibilityLabel = formatCompatibility(actor?.compatibility)

  // Memoize date formatting to avoid Date object allocation on every render
  // Avoid Date.parse on Hot Path: Pre-serialize timestamps as numbers (epoch ms)
  // Parsing ISO strings is surprisingly expensive during hydration
  // Backend should send createdAt as number (epoch ms) for Phase-1
  const formattedDate = useMemo(() => {
    if (!createdAt) return null
    // If createdAt is already a number (epoch ms), use it directly
    // Otherwise parse ISO string (fallback for Phase-2)
    const timestamp = typeof createdAt === 'number' 
      ? createdAt 
      : new Date(createdAt).getTime()
    if (Number.isNaN(timestamp)) return 'recent'
    const d = new Date(timestamp)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }, [createdAt])

  // Memoize tags slice to avoid array allocation
  const displayTags = useMemo(() => content?.tags?.slice(0, 2) ?? [], [content?.tags])

  // Memoize intent label to avoid string concatenation
  const intentLabel = useMemo(
    () => (actor?.intent ? `Intent: ${prettyIntent(actor.intent)}` : null),
    [actor?.intent]
  )

  return (
    <div className="u-stack">
      <div className="riverCard__name">
        <Avatar
          name={name}
          size="sm"
          src={actor?.avatarUrl ?? null}
          profileId={actor?.id != null ? String(actor.id) : null}
          className="riverCard__avatar"
        />
        <h2 className="u-clamp-1">{name}</h2>
        {age != null && <span>{age}</span>}
      </div>
      <div className="riverCard__chips">
        {actor?.locationText && <Pill>{actor.locationText}</Pill>}
        {intentLabel && <Pill>{intentLabel}</Pill>}
        {presenceLabel && <Pill>{presenceLabel}</Pill>}
        {compatibilityLabel && <Pill>{compatibilityLabel}</Pill>}
        {kind === 'post' && <Pill>Post</Pill>}
        {kind === 'media' && <Pill>Media</Pill>}
        {kind === 'question' && <Pill>Quiz</Pill>}
        {kind === 'highlight' && <Pill>Highlight</Pill>}
        {kind === 'match' && <Pill>Match</Pill>}
        {kind === 'suggestion' && <Pill>Suggestion</Pill>}
        {accent === 'match' && <Pill>New match</Pill>}
        {displayTags.map(tag => (
          <Pill key={tag}>{tag}</Pill>
        ))}
        {isOptimistic && <Pill>Posting...</Pill>}
        {formattedDate && <Pill>{formattedDate}</Pill>}
      </div>
    </div>
  )
}

function formatCompatibility(compatibility: FeedCardActor['compatibility']) {
  if (!compatibility) return null
  if (compatibility.status !== 'READY' || compatibility.score == null) {
    return 'Compatibility N/A'
  }
  const score = Math.round(compatibility.score * 100)
  return `Compatibility ${score}%`
}
