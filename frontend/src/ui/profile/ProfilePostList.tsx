import type { ProfilePost, Visibility } from '../../api/types'
import { api } from '../../api/client'
import { InlineChoiceChips } from '../form/InlineChoiceChips'
import { InlineTextarea } from '../form/InlineTextarea'

const visibilityOptions: { value: Visibility; label: string }[] = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'PRIVATE', label: 'Private' }
]

type Props = {
  posts: ProfilePost[]
  onPostUpdate: (postId: string | number, patch: Partial<ProfilePost>) => void
}

export function ProfilePostList({ posts, onPostUpdate }: Props) {
  if (!posts.length) {
    return (
      <div className="u-glass profile__card">
        <div className="u-stack">
          <div style={{ fontSize: 'var(--fs-4)', fontWeight: 650 }}>Your posts</div>
          <div className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>
            No posts yet. Share your first update.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="u-stack">
      {posts.map((post) => (
        <div key={String(post.id)} className="u-glass profile__card">
          <div className="u-stack">
            <div className="u-row-between">
              <div style={{ fontSize: 'var(--fs-4)', fontWeight: 650 }}>Post</div>
              <div className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>
                {formatDate(post.createdAt)}
              </div>
            </div>

            <InlineTextarea
              label="Post text"
              value={post.text ?? ''}
              placeholder="Share an update..."
              maxLength={320}
              onSave={async (value) => {
                const res = await api.posts.update(post.id, { text: value })
                onPostUpdate(post.id, { text: res.text ?? undefined })
              }}
            />

            <InlineChoiceChips
              label="Visibility"
              value={post.visibility ?? 'PUBLIC'}
              options={visibilityOptions}
              onSave={async (value) => {
                if (!value) return
                const res = await api.posts.update(post.id, { visibility: value })
                onPostUpdate(post.id, { visibility: res.visibility })
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function formatDate(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
