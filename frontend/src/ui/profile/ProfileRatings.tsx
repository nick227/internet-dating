import type { RatingScores, RatingSummary } from '../../api/types'
import { Pill } from '../ui/Pill'

type ProfileRatingsProps = {
  ratings?: RatingSummary
}

export function ProfileRatings({ ratings }: ProfileRatingsProps) {
  if (!ratings) return null
  const average = averageFromSummary(ratings.avg)
  const myAverage = ratings.mine ? averageFromScores(ratings.mine) : null

  if (average == null && myAverage == null) return null

  return (
    <>
    {average != null && (
            <Pill>
              {`Rating ${formatRating(average)}${ratings.count ? ` (${ratings.count})` : ''}`}
            </Pill>
          )}
          {myAverage != null && <Pill>{`Your rating ${formatRating(myAverage)}`}</Pill>}
    </>
  )
}

function averageFromSummary(avg: Partial<RatingScores>) {
  const values = [avg.attractive, avg.smart, avg.funny, avg.interesting].filter(
    (value): value is number => typeof value === 'number'
  )
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function averageFromScores(values: RatingScores) {
  return (values.attractive + values.smart + values.funny + values.interesting) / 4
}

function formatRating(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
