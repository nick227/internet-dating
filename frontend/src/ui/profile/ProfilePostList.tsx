import { useState, useMemo } from 'react'
import type { ProfilePost, Visibility } from '../../api/types'
import { api } from '../../api/client'
import { InlineChoiceChips } from '../form/InlineChoiceChips'
import { InlineTextarea } from '../form/InlineTextarea'

const visibilityOptions: { value: Visibility; label: string }[] = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'PRIVATE', label: 'Private' },
]

type Props = {
  posts: ProfilePost[]
  onPostUpdate?: (postId: string | number, patch: Partial<ProfilePost>) => void
  onPostDelete?: (postId: string | number) => void
  readOnly?: boolean
}

export function ProfilePostList({ posts, onPostUpdate, onPostDelete, readOnly }: Props) {
  const isReadOnly = readOnly ?? false
  const sortedPosts = useMemo(() => {
    const copy = [...posts]
    copy.sort((a, b) => {
      const aTime = Date.parse(a.createdAt)
      const bTime = Date.parse(b.createdAt)
      const aValue = Number.isNaN(aTime) ? -1 : aTime
      const bValue = Number.isNaN(bTime) ? -1 : bTime
      return bValue - aValue
    })
    return copy
  }, [posts])

  if (!posts.length) {
    const title = isReadOnly ? 'Posts' : 'Your posts'
    const message = isReadOnly ? 'No posts yet.' : 'No posts yet. Share your first update.'
    return (
      <div className="u-glass profile__card">
        <div className="u-stack">
          <div className="profile__sectionTitle">{title}</div>
          <div className="profile__meta">{message}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="u-stack">
      {sortedPosts.map(post => {
        const dateInfo = getDateInfo(post.createdAt)
        return (
          <PostItem
            key={String(post.id)}
            post={post}
            dateInfo={dateInfo}
            isReadOnly={isReadOnly}
            onPostUpdate={onPostUpdate}
            onPostDelete={onPostDelete}
          />
        )
      })}
    </div>
  )
}

function PostItem({
  post,
  dateInfo,
  isReadOnly,
  onPostUpdate,
  onPostDelete,
}: {
  post: ProfilePost
  dateInfo: DateInfo | null
  isReadOnly: boolean
  onPostUpdate?: (postId: string | number, patch: Partial<ProfilePost>) => void
  onPostDelete?: (postId: string | number) => void
}) {
  const [deleteBusy, setDeleteBusy] = useState(false)
  const mediaItems = post.media ?? []

  const handleDelete = async () => {
    if (!onPostDelete) return
    if (!confirm('Delete this post?')) return
    setDeleteBusy(true)
    try {
      await api.posts.delete(post.id)
      onPostDelete(post.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete post')
    } finally {
      setDeleteBusy(false)
    }
  }

  const handleRemoveMedia = async (mediaId: string | number) => {
    if (!onPostUpdate) return
    setDeleteBusy(true)
    try {
      await api.posts.deleteMedia(post.id, mediaId)
      onPostUpdate(post.id, {
        media: mediaItems.filter(m => String(m.id) !== String(mediaId)),
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove media')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="u-glass profile__card">
      <div className="u-stack">
        <div className="u-row-between">
          <div className="profile__sectionTitle">Post</div>
          <div className="u-row u-gap-3">
            {dateInfo && (
              <time className="profile__meta" dateTime={dateInfo.dateTime} title={dateInfo.full}>
                {dateInfo.short}
              </time>
            )}
            {!isReadOnly && (
              <button
                className="topBar__btn profile__postDelete"
                type="button"
                onClick={handleDelete}
                disabled={deleteBusy}
              >
                {deleteBusy ? 'Deleting...' : 'Delete'}
              </button>
            )}
          </div>
        </div>

        {isReadOnly ? (
          post.text ? (
            <div className="profile__postText">{post.text}</div>
          ) : (
            <div className="profile__meta">Media-only post.</div>
          )
        ) : (
          <InlineTextarea
            label="Post text"
            value={post.text ?? ''}
            placeholder="Share an update..."
            maxLength={320}
            onSave={async value => {
              if (!onPostUpdate) return
              const res = await api.posts.update(post.id, { text: value })
              onPostUpdate(post.id, { text: res.text ?? undefined })
            }}
          />
        )}

        {mediaItems.length > 0 && (
          <div className="profile__postMedia u-hide-scroll">
            {mediaItems.map(media => {
              const preview = media.thumbUrl ?? media.url
              const isVideo = media.type === 'VIDEO'
              return (
                <div key={String(media.id)} className="profile__postMediaThumb u-relative">
                  {isVideo ? (
                    <video src={media.url} poster={preview} muted playsInline preload="metadata" />
                  ) : (
                    <img src={preview} alt="Post media" loading="lazy" />
                  )}
                  {!isReadOnly && (
                    <button
                      className="mediaDeleteBtn"
                      type="button"
                      onClick={() => handleRemoveMedia(media.id)}
                      disabled={deleteBusy}
                      aria-label="Remove media"
                    >
                      ×
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {!isReadOnly && (
          <InlineChoiceChips
            label="Visibility"
            value={post.visibility ?? 'PUBLIC'}
            options={visibilityOptions}
            onSave={async value => {
              if (!onPostUpdate || !value) return
              const res = await api.posts.update(post.id, { visibility: value })
              onPostUpdate(post.id, { visibility: res.visibility })
            }}
          />
        )}
      </div>
    </div>
  )
}

type DateInfo = {
  short: string
  full: string
  dateTime: string
}

function getDateInfo(value: string): DateInfo | null {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return {
    short: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    full: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    dateTime: d.toISOString(),
  }
}
