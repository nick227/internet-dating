import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { ApiComment } from '../../api/comments'
import { getCommentReplies } from '../../api/comments'
import { commentCache } from '../../core/comments/commentCache'
import { CommentRow } from './CommentRow'
import { CommentComposer } from './CommentComposer'

type CommentListProps = {
  comments: ApiComment[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  onLoadMore: () => void
  onLike: (commentId: string, currentLiked: boolean, parentId?: string) => Promise<void>
  onReply: (commentId: string, parentAuthorName: string) => void
  onMentionClick: (userId: string) => void
  onDelete?: (commentId: string, isReply: boolean, parentId?: string) => void
  onSubmitComment: (text: string, parentId?: string) => Promise<void>
  currentUserId?: string
}

/**
 * Component for rendering list of comments with nested replies
 * SRP: Handles comment list rendering, reply expansion, and pagination
 */
function CommentListComponent({
  comments,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onLike,
  onReply: _onReply,
  onMentionClick,
  onDelete,
  onSubmitComment,
  currentUserId,
}: CommentListProps) {
  const generateClientRequestId = useCallback(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `local-${crypto.randomUUID()}`
    }
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(2, 15) + Math.random().toString(36).slice(2, 15)
    return `local-${timestamp}-${random}`
  }, [])
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())
  const [replies, setReplies] = useState<Map<string, ApiComment[]>>(new Map())
  const [loadingReplies, setLoadingReplies] = useState<Set<string>>(new Set())
  const [replyingTo, setReplyingTo] = useState<string | null>(null) // Single active reply mode
  const listRef = useRef<HTMLDivElement | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const [showNewCommentsAffordance, setShowNewCommentsAffordance] = useState(false)

  const handleReplyLike = useCallback(
    (commentId: string, currentLiked: boolean, parentId: string) => {
      const existingReplies = replies.get(parentId)
      const previousReply = existingReplies?.find(reply => reply.id === commentId)
      if (existingReplies && previousReply) {
        const nextLiked = !currentLiked
        const nextLikeCount = nextLiked
          ? previousReply.likeCount + 1
          : Math.max(0, previousReply.likeCount - 1)
        const nextReplies: ApiComment[] = existingReplies.map(reply =>
          reply.id === commentId
            ? { ...reply, myReaction: nextLiked ? 'like' : null, likeCount: nextLikeCount }
            : reply
        )
        setReplies(prev => new Map(prev).set(parentId, nextReplies))
        commentCache.setReplies(parentId, {
          replies: nextReplies,
          nextCursorId: commentCache.getReplies(parentId)?.nextCursorId,
        })
      }

      return onLike(commentId, currentLiked, parentId).catch(error => {
        if (existingReplies && previousReply) {
          setReplies(prev => new Map(prev).set(parentId, existingReplies))
          commentCache.setReplies(parentId, {
            replies: existingReplies,
            nextCursorId: commentCache.getReplies(parentId)?.nextCursorId,
          })
        }
        throw error
      })
    },
    [onLike, replies]
  )

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || loadingMore) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          onLoadMore()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, onLoadMore])

  // Load replies for a comment
  const loadReplies = useCallback(
    async (commentId: string, force = false) => {
      if (loadingReplies.has(commentId)) return

      // Check cache first
      if (!force) {
        const cached = commentCache.getReplies(commentId)
        if (cached) {
          setReplies(prev => new Map(prev).set(commentId, cached.replies))
          setExpandedReplies(prev => new Set(prev).add(commentId))
          return
        }
      }

      setLoadingReplies(prev => new Set(prev).add(commentId))

      try {
        const result = await getCommentReplies(commentId)
        setReplies(prev => new Map(prev).set(commentId, result.replies))
        setExpandedReplies(prev => new Set(prev).add(commentId))

        // Update cache
        commentCache.setReplies(commentId, {
          replies: result.replies,
          nextCursorId: result.nextCursorId,
        })
      } catch (error) {
        console.error('Failed to load replies:', error)
      } finally {
        setLoadingReplies(prev => {
          const next = new Set(prev)
          next.delete(commentId)
          return next
        })
      }
    },
    [loadingReplies]
  )

  // Toggle replies visibility
  const toggleReplies = useCallback(
    (commentId: string, replyCount: number) => {
      if (expandedReplies.has(commentId)) {
        setExpandedReplies(prev => {
          const next = new Set(prev)
          next.delete(commentId)
          return next
        })
        // Close any active reply composer when collapsing
        if (replyingTo === commentId) {
          setReplyingTo(null)
        }
      } else if (replyCount > 0) {
        void loadReplies(commentId)
      }
    },
    [expandedReplies, loadReplies, replyingTo]
  )

  // Handle reply - single active mode (close others)
  const handleReplyClick = useCallback(
    (commentId: string) => {
      // If already replying to this comment, close it
      if (replyingTo === commentId) {
        setReplyingTo(null)
      } else {
        // Close any other active reply and open this one
        setReplyingTo(commentId)
        // Expand replies if not already expanded
        if (!expandedReplies.has(commentId)) {
          void loadReplies(commentId)
        }
      }
    },
    [replyingTo, expandedReplies, loadReplies]
  )

  // Handle reply submission
  const handleReplySubmit = useCallback(
    async (text: string, parentId: string) => {
      const clientRequestId = generateClientRequestId()
      const optimisticReply: ApiComment = {
        id: clientRequestId,
        body: text,
        author: {
          id: currentUserId ?? 'me',
          name: 'You',
        },
        createdAt: new Date().toISOString(),
        likeCount: 0,
        replyCount: undefined,
        myReaction: null,
        mentionedUserIds: [],
        pending: true,
      }

      setReplies(prev => {
        const next = new Map(prev)
        const existing = next.get(parentId) ?? []
        next.set(parentId, [...existing, optimisticReply])
        return next
      })
      commentCache.addOptimisticReply(parentId, optimisticReply)
      setExpandedReplies(prev => new Set(prev).add(parentId))

      try {
        await onSubmitComment(text, parentId)
        setReplyingTo(null)
        void loadReplies(parentId, true)
      } catch (error) {
        setReplies(prev => {
          const next = new Map(prev)
          const existing = next.get(parentId) ?? []
          next.set(parentId, existing.filter(reply => reply.id !== clientRequestId))
          return next
        })
        const cached = commentCache.getReplies(parentId)
        if (cached) {
          commentCache.setReplies(parentId, {
            replies: cached.replies.filter(reply => reply.id !== clientRequestId),
            nextCursorId: cached.nextCursorId,
          })
        }
        throw error
      }
    },
    [onSubmitComment, loadReplies, currentUserId, generateClientRequestId]
  )

  // Conditional auto-scroll: only if near bottom
  useEffect(() => {
    const container = listRef.current
    if (!container || comments.length === 0) return

    const { scrollTop, scrollHeight, clientHeight } = container
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    const isNearBottom = distanceFromBottom < 120 // pixels

    if (isNearBottom) {
      // Auto-scroll to bottom
      container.scrollTo({
        top: scrollHeight,
        behavior: 'smooth',
      })
      setShowNewCommentsAffordance(false)
    } else {
      // Show affordance
      setShowNewCommentsAffordance(true)
    }
  }, [comments.length])

  // Track scroll position to hide affordance when user scrolls near bottom
  useEffect(() => {
    const container = listRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      if (distanceFromBottom < 120) {
        setShowNewCommentsAffordance(false)
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  if (loading && comments.length === 0) {
    return (
      <div className="commentList commentList--loading">
        <div className="commentList__loading">Loading comments...</div>
      </div>
    )
  }

  if (comments.length === 0) {
    return (
      <div className="commentList commentList--empty">
        <div className="commentList__empty">No comments yet. Be the first to comment!</div>
      </div>
    )
  }

  return (
    <div className="commentList" ref={listRef} style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      {comments.map(comment => {
        const isAuthor = currentUserId === comment.author.id
        const commentReplies = replies.get(comment.id) ?? []
        const hasReplies = (comment.replyCount ?? 0) > 0
        const isExpanded = expandedReplies.has(comment.id)
        const isLoadingReplies = loadingReplies.has(comment.id)
        const isReplying = replyingTo === comment.id

        return (
          <div key={comment.id} className="commentList__item">
            <CommentRow
              comment={comment}
              depth={0}
              onLike={(commentId, currentLiked) => onLike(commentId, currentLiked)}
              onReply={handleReplyClick}
              onMentionClick={onMentionClick}
              onDelete={onDelete ? commentId => onDelete(commentId, false) : undefined}
              isAuthor={isAuthor}
            />

            {/* Reply composer */}
            {isReplying && (
              <div className="commentList__replyComposer">
                <CommentComposer
                  parentId={comment.id}
                  parentAuthorName={comment.author.name}
                  placeholder={`Reply to ${comment.author.name}...`}
                  onSubmit={text => handleReplySubmit(text, comment.id)}
                  onCancel={() => setReplyingTo(null)}
                />
              </div>
            )}

            {/* Replies section */}
            {hasReplies && (
              <div className="commentList__replies">
                {!isExpanded ? (
                  <button
                    type="button"
                    className="commentList__showReplies"
                    onClick={() => toggleReplies(comment.id, comment.replyCount ?? 0)}
                  >
                    View {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
                  </button>
                ) : (
                  <>
                    {isLoadingReplies ? (
                      <div className="commentList__loadingReplies">Loading replies...</div>
                    ) : (
                      <>
                        {commentReplies.map(reply => (
                          <CommentRow
                            key={reply.id}
                            comment={reply}
                            depth={1}
                            onLike={(commentId, currentLiked) => handleReplyLike(commentId, currentLiked, comment.id)}
                            onReply={handleReplyClick}
                            onMentionClick={onMentionClick}
                            onDelete={onDelete ? replyId => onDelete(replyId, true, comment.id) : undefined}
                            isAuthor={currentUserId === reply.author.id}
                          />
                        ))}
                        <button
                          type="button"
                          className="commentList__hideReplies"
                          onClick={() => toggleReplies(comment.id, comment.replyCount ?? 0)}
                        >
                          Hide replies
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* New comments affordance */}
      {showNewCommentsAffordance && (
        <button
          type="button"
          className="commentList__newCommentsAffordance"
          onClick={() => {
            listRef.current?.scrollTo({
              top: listRef.current.scrollHeight,
              behavior: 'smooth',
            })
            setShowNewCommentsAffordance(false)
          }}
        >
          ↓ New comments
        </button>
      )}

      {/* Load more trigger */}
      {hasMore && (
        <div ref={loadMoreRef} className="commentList__loadMore">
          {loadingMore ? (
            <div className="commentList__loadingMore">Loading more...</div>
          ) : (
            <button type="button" className="commentList__loadMoreBtn" onClick={onLoadMore}>
              Load more comments
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export const CommentList = memo(CommentListComponent)
