import { memo, useCallback, useEffect, useRef } from 'react'
import { useCommentWidget } from './useCommentWidget'
import { useCommentActions } from './useCommentActions'
import { useCurrentUser } from '../../core/auth/useCurrentUser'
import { CommentList } from './CommentList'
import { CommentComposer } from './CommentComposer'

// Helper for screen reader announcements (no-op if not available)
function announceToScreenReader(message: string) {
  // Screen reader announcements would go here if needed
  // For now, just log for debugging
  console.log('[CommentWidget] Screen reader:', message)
}

// Event model for comment mutations
export type CommentMutationEvent =
  | { type: 'added'; totalCount: number }
  | { type: 'removed'; totalCount: number }
  | { type: 'hidden'; totalCount: number }

type CommentWidgetProps = {
  postId: string
  initialCommentCount?: number
  isOpen: boolean
  onToggle: () => void
  onMentionClick?: (userId: string) => void
  onError?: (error: Error) => void
  // Event handlers - all receive authoritative count from server (or undefined if not available)
  onCommentPosted?: (authoritativeCount: number | undefined) => void
  onCommentRemoved?: (authoritativeCount: number | undefined) => void
  onCommentHidden?: (authoritativeCount: number | undefined) => void
}

/**
 * Comment widget with open/closed states
 * SRP: Manages widget state, delegates to CommentList and CommentComposer
 */
function CommentWidgetComponent({
  postId,
  initialCommentCount = 0,
  isOpen,
  onToggle,
  onMentionClick,
  onError,
  onCommentPosted,
  onCommentRemoved,
}: CommentWidgetProps) {
  const widgetRef = useRef<HTMLDivElement | null>(null)
  const touchHandlersRef = useRef<{
    handleTouchMove?: (e: TouchEvent) => void
    handleTouchEnd?: () => void
  }>({})
  const { userId: currentUserIdBigInt } = useCurrentUser()
  const currentUserId = currentUserIdBigInt ? String(currentUserIdBigInt) : undefined
  const submitLockRef = useRef(false)

  const {
    comments,
    loading,
    loadingMore,
    hasMore,
    sort,
    setSort,
    loadMore,
    submitComment,
    updateCommentState,
    removeCommentState,
    updateParentReplyCount,
    reload,
    isSubmitting,
  } = useCommentWidget({
    postId,
    isOpen,
    initialCommentCount,
    onError,
  })

  const { handleLike, handleDelete } = useCommentActions({
    postId,
    onError,
    onLikeSuccess: () => announceToScreenReader('Like added'),
    onUnlikeSuccess: () => announceToScreenReader('Like removed'),
    onDeleteSuccess: () => announceToScreenReader('Comment deleted'),
    updateCommentState,
    removeCommentState,
    updateParentReplyCount,
  })

  // Wrapper to match CommentRow's onLike signature (commentId + currentLiked)
  const handleLikeWrapper = useCallback(
    (commentId: string, currentLiked: boolean, parentId?: string) => {
      return handleLike(commentId, currentLiked, parentId)
    },
    [handleLike]
  )

  // Handle delete with reload
  const handleDeleteWithReload = useCallback(
    async (commentId: string, isReply: boolean, parentId?: string) => {
      await handleDelete(commentId, isReply, parentId)
      await reload()
      onCommentRemoved?.(undefined)
    },
    [handleDelete, reload, onCommentRemoved]
  )

  // Handle mention click
  const handleMentionClick = useCallback(
    (userId: string) => {
      onMentionClick?.(userId)
    },
    [onMentionClick]
  )

  // Handle reply - CommentList manages its own reply state
  const handleReply = useCallback(() => {
    // CommentList handles reply state internally via handleReplyClick
    // This is just a placeholder to match the prop signature
  }, [])

  // Note: Auto-scroll is now handled by CommentList's conditional auto-scroll
  // This effect is removed to avoid conflicts

  // Handle submit (root comment) with debouncing
  const handleSubmit = useCallback(
    async (text: string) => {
      // Prevent double submission
      if (submitLockRef.current || isSubmitting) {
        console.warn('[CommentWidget] Submit already in progress, ignoring')
        return
      }

      console.log('[CommentWidget] handleSubmit called', { text, postId })
      submitLockRef.current = true
      announceToScreenReader('Posting comment...')
      try {
        console.log('[CommentWidget] Calling submitComment')
        await submitComment(text)
        onCommentPosted?.(undefined)
        announceToScreenReader('Comment posted')
      } catch (err) {
        console.error('[CommentWidget] handleSubmit failed:', err)
        throw err
      } finally {
        submitLockRef.current = false
      }
    },
    [submitComment, postId, onCommentPosted, isSubmitting]
  )

  // Keyboard shortcuts: Escape to close
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onToggle()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onToggle])

  // Cleanup touch handlers on unmount
  useEffect(() => {
    return () => {
      const handlers = touchHandlersRef.current
      if (handlers.handleTouchMove) {
        document.removeEventListener('touchmove', handlers.handleTouchMove)
      }
      if (handlers.handleTouchEnd) {
        document.removeEventListener('touchend', handlers.handleTouchEnd)
      }
      touchHandlersRef.current = {}
    }
  }, [])

  if (!isOpen) {
    return (
      <button
        type="button"
        className="commentWidget commentWidget--closed"
        onClick={onToggle}
        aria-label={`${initialCommentCount} comments`}
      >
        <span className="commentWidget__icon">💬</span>
        {initialCommentCount > 0 && (
          <span className="commentWidget__badge">{initialCommentCount}</span>
        )}
      </button>
    )
  }

  return (
    <div
      className="commentWidget commentWidget--open"
      ref={widgetRef}
      onClick={e => {
        // Background tap to close (gesture-first dismissal)
        if (e.target === widgetRef.current) {
          onToggle()
        }
      }}
      onTouchStart={e => {
        // Swipe down to close (gesture-first dismissal)
        // Only trigger on header or background, not on scrollable content
        const target = e.target as HTMLElement
        if (target.closest('.commentWidget__header') || target === widgetRef.current) {
          const touch = e.touches[0]
          if (touch) {
            const startY = touch.clientY
            const handleTouchMove = (moveEvent: TouchEvent) => {
              const currentY = moveEvent.touches[0]?.clientY ?? startY
              const deltaY = currentY - startY
              if (deltaY > 50) {
                // Swipe down detected
                onToggle()
                // Clean up listeners
                document.removeEventListener('touchmove', handleTouchMove)
                if (touchHandlersRef.current.handleTouchEnd) {
                  document.removeEventListener('touchend', touchHandlersRef.current.handleTouchEnd)
                }
              }
            }
            const handleTouchEnd = () => {
              document.removeEventListener('touchmove', handleTouchMove)
              document.removeEventListener('touchend', handleTouchEnd)
              // Clear refs
              touchHandlersRef.current.handleTouchMove = undefined
              touchHandlersRef.current.handleTouchEnd = undefined
            }
            
            // Store handlers in ref for cleanup
            touchHandlersRef.current.handleTouchMove = handleTouchMove
            touchHandlersRef.current.handleTouchEnd = handleTouchEnd
            
            document.addEventListener('touchmove', handleTouchMove, { passive: true })
            document.addEventListener('touchend', handleTouchEnd, { once: true })
          }
        }
      }}
    >
      <div className="commentWidget__header">
        <div className="commentWidget__headerLeft">
          <h3 className="commentWidget__title">Comments</h3>
          {initialCommentCount > 0 && (
            <span className="commentWidget__count">{initialCommentCount}</span>
          )}
        </div>
        <div className="commentWidget__headerRight">
          <div className="commentWidget__sort">
            <button
              type="button"
              className={`commentWidget__sortBtn ${sort === 'recent' ? 'commentWidget__sortBtn--active' : ''}`}
              onClick={() => setSort('recent')}
            >
              Recent
            </button>
            <button
              type="button"
              className={`commentWidget__sortBtn ${sort === 'popular' ? 'commentWidget__sortBtn--active' : ''}`}
              onClick={() => setSort('popular')}
            >
              Popular
            </button>
          </div>
          <button
            type="button"
            className="commentWidget__close"
            onClick={onToggle}
            aria-label="Close comments"
          >
            ×
          </button>
        </div>
      </div>

      <div className="commentWidget__content">
        <CommentList
          comments={comments}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onLike={handleLikeWrapper}
          onReply={handleReply}
          onMentionClick={handleMentionClick}
          onDelete={handleDeleteWithReload}
          onSubmitComment={async (text: string, parentId?: string) => {
            // CommentList expects Promise<void>.
            await submitComment(text, parentId)
          }}
          currentUserId={currentUserId}
        />
      </div>

      <div className="commentWidget__composer">
        <CommentComposer
          placeholder="Write a comment..."
          onSubmit={handleSubmit}
          disabled={loading || isSubmitting}
        />
      </div>
    </div>
  )
}

export const CommentWidget = memo(CommentWidgetComponent)
