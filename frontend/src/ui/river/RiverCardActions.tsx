import type { FeedCardStats, Id } from '../../api/types'
import { ActionBar } from '../actions/ActionBar'

type RiverCardActionsProps = {
  actorId?: Id
  onToast?: (message: string) => void
  initialRating?: FeedCardStats['myRating'] | null
  onRated?: (rating: NonNullable<FeedCardStats['myRating']>) => void
  commentLabel?: string
}

export function RiverCardActions({
  actorId,
  onToast,
  initialRating,
  onRated,
}: RiverCardActionsProps) {
  if (!actorId) return null

  return (
    <div className="riverCard__actions" onClick={stopPropagation} onKeyDown={stopPropagation}>
      <ActionBar
        userId={actorId}
        onToast={onToast}
        initialRating={initialRating ?? null}
        onRated={onRated}
      />
    </div>
  )
}

function stopPropagation(event: { stopPropagation: () => void }) {
  event.stopPropagation()
}
