import { useState, useMemo, createContext, useContext, useCallback } from 'react'
import type { ProfilePost, ProfileMedia } from '../../api/types'
import { api } from '../../api/client'
import { Media } from '../ui/Media'
import { Avatar } from '../ui/Avatar'
import { CommentWidget } from '../river/CommentWidget'
import { useCurrentUser } from '../../core/auth/useCurrentUser'

type Props = {
  posts: ProfilePost[]
  onPostDelete?: (postId: string | number) => void
  onPostUpdate?: (postId: string | number, patch: Partial<ProfilePost>) => void
  readOnly?: boolean
  authorName?: string | null
  authorAvatarUrl?: string | null
  authorId?: string | number | null
}

type PostListContextType = {
  onPostDelete?: (postId: string | number) => void
  onPostUpdate?: (postId: string | number, patch: Partial<ProfilePost>) => void
  isReadOnly: boolean
  authorName?: string | null
  authorAvatarUrl?: string | null
  authorId?: string | number | null
}

const PostListContext = createContext<PostListContextType>({
  isReadOnly: false,
})

export function ProfilePostList({
  posts,
  onPostDelete,
  onPostUpdate,
  readOnly,
  authorName,
  authorAvatarUrl,
  authorId,
}: Props) {
  const isReadOnly = readOnly ?? false

  const sortedPosts = useMemo(() => {
    return [...posts].sort((a, b) => {
      const tA = new Date(a.createdAt).getTime()
      const tB = new Date(b.createdAt).getTime()
      if (Number.isNaN(tA)) return 1
      if (Number.isNaN(tB)) return -1
      return tB - tA
    })
  }, [posts])

  const contextValue = useMemo<PostListContextType>(
    () => ({
      onPostDelete,
      onPostUpdate,
      isReadOnly,
      authorName,
      authorAvatarUrl,
      authorId,
    }),
    [onPostDelete, onPostUpdate, isReadOnly, authorName, authorAvatarUrl, authorId]
  )

  if (!posts.length) {
    return <EmptyState isReadOnly={isReadOnly} />
  }

  return (
    <PostListContext.Provider value={contextValue}>
      <div className="u-stack">
        {sortedPosts.map(post => (
          <PostItem key={post.id} post={post} />
        ))}
      </div>
    </PostListContext.Provider>
  )
}

function EmptyState({ isReadOnly }: { isReadOnly: boolean }) {
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

function PostItem({ post }: { post: ProfilePost }) {
  const {
    isReadOnly,
    onPostDelete,
    authorName,
    authorAvatarUrl,
    authorId,
  } = useContext(PostListContext)
  const [isBusy, setIsBusy] = useState(false)
  const [commentOpen, setCommentOpen] = useState(false)
  
  // Use post author info if available, otherwise fall back to context (for backwards compatibility)
  const postAuthor = post.author
  const displayName = postAuthor?.displayName?.trim() || authorName?.trim() || (isReadOnly ? 'User' : 'You')
  const avatarUrl = postAuthor?.avatarUrl ?? authorAvatarUrl ?? null
  const profileId = postAuthor?.id ? String(postAuthor.id) : (authorId != null ? String(authorId) : null)
  
  // Check if current user is the post author
  const { userId: currentUserId } = useCurrentUser()
  const canDelete = onPostDelete && (
    (currentUserId && String(currentUserId) === String(post.userId)) || 
    (currentUserId && postAuthor?.id && String(currentUserId) === String(postAuthor.id))
  )

  const dateInfo = useMemo(() => getDateInfo(post.createdAt), [post.createdAt])
  const mediaItems = useMemo(() => post.media ?? [], [post.media])
  
  const handleToggleComments = useCallback(() => {
    setCommentOpen(prev => !prev)
  }, [])
  
  const handleCommentPosted = useCallback(() => {
    // Comment count will update via feed refresh
  }, [])
  
  const handleMentionClick = useCallback((_userId: string) => {
    // Navigate to profile - can be enhanced later if needed
  }, [])

  const gallery = useMemo(
    () =>
      mediaItems.map(m => ({
        src: m.url,
        alt: 'Post media',
        type: (isVideoMedia(m) ? 'video' : 'image') as 'video' | 'image',
        poster: m.thumbUrl ?? m.url,
      })),
    [mediaItems]
  )

  const handleDeletePost = async () => {
    if (!onPostDelete || isBusy) return
    if (!confirm('Delete this post?')) return

    setIsBusy(true)
    try {
      await api.posts.delete(post.id)
      onPostDelete(post.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete post')
      setIsBusy(false)
    }
  }

  return (
    <div className={`u-glass profile__card ${isBusy ? 'u-opacity-50' : ''}`} style={{ transition: 'opacity 0.2s' }}>
      <div className="u-stack u-gap-3">
        <div className="u-row u-gap-2 u-items-center">
          <Avatar name={displayName} size="sm" src={avatarUrl} profileId={profileId} />
          <div className="profile__itemTitle">{displayName}</div>
        </div>

        {/* Content */}
        {post.text && (
          <div className="profile__postText">
            {post.text}
          </div>
        )}

        {/* Media Grid */}
        {mediaItems.length > 0 && (
          <div className={`profile__mediaGrid profile__mediaGrid--${Math.min(mediaItems.length, 4)}`}>
            {mediaItems.map((media, index) => {
              const preview = media.thumbUrl ?? media.url
              const isVideo = isVideoMedia(media)
              const mediaSrc = isVideo ? media.url : preview
              
              // Only layout logic for first 4 items if we wanted a strict grid, 
              // but here we just map them. CSS handles the grid columns.
              return (
                <div key={media.id} className="profile__mediaItem">
                  <Media
                    src={mediaSrc}
                    alt="Post media"
                    type={isVideo ? 'video' : 'image'}
                    poster={isVideo ? preview : undefined}
                    gallery={gallery}
                    galleryIndex={index}
                    autoplayOnScroll={isVideo}
                    className="u-obj-cover u-full-size u-rounded"
                  />
                </div>
              )
            })}
          </div>
        )}

        <CommentWidget
          postId={String(post.id)}
          initialCommentCount={0}
          isOpen={commentOpen}
          onToggle={handleToggleComments}
          onMentionClick={handleMentionClick}
          onCommentPosted={handleCommentPosted}
        />

        {/* Header: Meta & Actions */}
        <div className="u-row-between">
          <div className="u-row u-gap-2 u-items-center">
            {dateInfo && (
              <time className="profile__meta" dateTime={dateInfo.dateTime} title={dateInfo.full}>
                {dateInfo.short}
              </time>
            )}
            {post.visibility === 'PRIVATE' && (
              <span className="u-badge u-badge--subtle" title="Only you can see this post">
                <span className="u-icon-lock u-text-sm" /> Private
              </span>
            )}
          </div>

          {canDelete && (
            <button
              className="u-btn-icon profile__postDelete"
              type="button"
              onClick={handleDeletePost}
              disabled={isBusy}
              title="Delete post"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

function getDateInfo(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return {
    short: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    full: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    dateTime: d.toISOString(),
  }
}

const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v)(\?|#|$)/i

function isVideoMedia(media: ProfileMedia) {
  if (typeof media.type === 'string' && media.type.toUpperCase() === 'VIDEO') {
    return true
  }
  return VIDEO_EXTENSIONS.test(media.url)
}
