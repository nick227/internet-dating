import type { FeedCardStats } from '../../api/types'

const countFormatter = new Intl.NumberFormat()

export function RiverCardEngagement({ stats }: { stats?: FeedCardStats }) {
  if (!stats) return null
  const items = buildEngagementItems(stats)
  if (!items.length) return null

  return (
    <div className="riverCard__engagement" onClick={stopPropagation} onKeyDown={stopPropagation}>
      {items.map(item => (
        <span key={item.kind} className="riverCard__stat" data-kind={item.kind}>
          {item.label}
        </span>
      ))}
    </div>
  )
}

function buildEngagementItems(stats: FeedCardStats) {
  const items: Array<{ kind: string; label: string }> = []

  if (stats.likeCount != null) {
    const countLabel = formatCount(stats.likeCount)
    items.push({ kind: 'likes', label: `${countLabel} ${pluralize(stats.likeCount, 'Like')}` })
  }

  if (stats.commentCount != null) {
    const countLabel = formatCount(stats.commentCount)
    items.push({
      kind: 'comments',
      label: `${countLabel} ${pluralize(stats.commentCount, 'Comment')}`,
    })
  }

  if (stats.ratingAverage != null) {
    const ratingValue = formatRating(stats.ratingAverage)
    const ratingCount = stats.ratingCount != null ? ` (${formatCount(stats.ratingCount)})` : ''
    items.push({ kind: 'rating', label: `Rating ${ratingValue}${ratingCount}` })
  }

  if (stats.myRating) {
    const myRating = formatRating(averageMyRating(stats.myRating))
    items.push({ kind: 'my-rating', label: `Your rating ${myRating}` })
  }

  return items
}

function formatCount(value: number) {
  return countFormatter.format(value)
}

function formatRating(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function pluralize(value: number, label: string) {
  return value === 1 ? label : `${label}s`
}

function averageMyRating(values: NonNullable<FeedCardStats['myRating']>) {
  const total = values.attractive + values.smart + values.funny + values.interesting
  return total / 4
}

function stopPropagation(event: { stopPropagation: () => void }) {
  event.stopPropagation()
}
