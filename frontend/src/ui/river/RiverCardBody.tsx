import type { FeedCardContent } from '../../api/types'

export function RiverCardBody({ content }: { content?: FeedCardContent }) {
  if (!content?.body) return null
  return <div className="riverCard__description u-clamp-2">{content.body}</div>
}
