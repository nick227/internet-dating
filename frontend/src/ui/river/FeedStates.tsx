import { RiverSkeleton } from './RiverSkeleton'

type FeedStatesProps = {
  loading: boolean
  error: string | null
  itemCount: number
  hasMore: boolean
  onRetry: () => void
}

export function FeedStates({ loading, error, itemCount, hasMore, onRetry }: FeedStatesProps) {
  if (error) {
    return (
      <FeedPanel
        title="Feed error"
        message={error}
        action={{ label: 'Retry', onClick: onRetry }}
      />
    )
  }

  if (!loading && itemCount === 0) {
    return (
      <FeedPanel
        title="No matches yet"
        message="Check back soon for fresh profiles and posts."
      />
    )
  }

  if (loading && itemCount > 0) {
    return <RiverSkeleton />
  }

  if (!hasMore && itemCount > 0) {
    return <FeedEndNotice />
  }

  return null
}

type FeedPanelProps = {
  title: string
  message?: string
  action?: { label: string; onClick: () => void }
}

function FeedPanel({ title, message, action }: FeedPanelProps) {
  return (
    <div className="u-glass u-pad-4 river__panel">
      <div className="river__panelTitle">{title}</div>
      {message && <div className="u-muted u-mt-2 river__panelText">{message}</div>}
      {action && (
        <button className="actionBtn u-mt-4" onClick={action.onClick} type="button">
          {action.label}
        </button>
      )}
    </div>
  )
}

function FeedEndNotice() {
  return <div className="u-muted river__end">You are all caught up.</div>
}
