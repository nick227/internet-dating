import { useCallback } from 'react'
import type { ApiComment } from '../../api/comments'
import { likeComment, deleteComment, editComment } from '../../api/comments'
import { commentCache } from '../../core/comments/commentCache'

type UseCommentActionsOptions = {
  postId: string
  onError?: (error: Error) => void
  onLikeSuccess?: () => void
  onUnlikeSuccess?: () => void
  onDeleteSuccess?: () => void
  updateCommentState?: (commentId: string, updater: (comment: ApiComment) => ApiComment) => void
  removeCommentState?: (commentId: string) => void
  updateParentReplyCount?: (parentId: string, delta: number) => void
}

/**
 * Hook for comment actions (like, delete, edit)
 * SRP: Handles optimistic updates and API calls for comment actions
 */
export function useCommentActions({
  postId,
  onError,
  onLikeSuccess,
  onUnlikeSuccess,
  onDeleteSuccess,
  updateCommentState,
  removeCommentState,
  updateParentReplyCount,
}: UseCommentActionsOptions) {
  const handleLike = useCallback(
    async (commentId: string, currentLiked: boolean, parentId?: string) => {
      let previousState: ApiComment | null = null
      let previousCache: { myReaction?: 'like' | null; likeCount: number } | null = null
      let previousReplyCache: { myReaction?: 'like' | null; likeCount: number } | null = null
      const captureAndUpdateState = (newLiked: boolean, likeCount?: number) => {
        updateCommentState?.(commentId, comment => {
          if (!previousState) {
            previousState = comment
          }
          const nextLikeCount =
            likeCount ?? (newLiked ? comment.likeCount + 1 : Math.max(0, comment.likeCount - 1))
          return {
            ...comment,
            myReaction: newLiked ? 'like' : null,
            likeCount: nextLikeCount,
          }
        })
      }

      const newLiked = !currentLiked

      // Optimistic update (root cache)
      const cached = commentCache.get(postId)
      if (cached) {
        const comment = cached.comments.find(c => c.id === commentId)
        if (comment) {
          previousCache = {
            myReaction: comment.myReaction ?? null,
            likeCount: comment.likeCount,
          }
          const newLikeCount = newLiked ? comment.likeCount + 1 : Math.max(0, comment.likeCount - 1)
          commentCache.updateComment(postId, commentId, {
            myReaction: newLiked ? 'like' : null,
            likeCount: newLikeCount,
          })
        }
      }

      // Optimistic update (reply cache)
      if (parentId) {
        const replyCache = commentCache.getReplies(parentId)
        const reply = replyCache?.replies.find(r => r.id === commentId)
        if (replyCache && reply) {
          previousReplyCache = {
            myReaction: reply.myReaction ?? null,
            likeCount: reply.likeCount,
          }
          const newLikeCount = newLiked ? reply.likeCount + 1 : Math.max(0, reply.likeCount - 1)
          commentCache.setReplies(parentId, {
            replies: replyCache.replies.map(r =>
              r.id === commentId
                ? { ...r, myReaction: newLiked ? 'like' : null, likeCount: newLikeCount }
                : r
            ),
            nextCursorId: replyCache.nextCursorId,
          })
        }
      }

      captureAndUpdateState(!currentLiked)

      try {
        const result = await likeComment(commentId, { like: !currentLiked })
        // Update with server response
        commentCache.updateComment(postId, commentId, {
          myReaction: result.liked ? 'like' : null,
          likeCount: result.likeCount,
        })
        if (parentId) {
          const replyCache = commentCache.getReplies(parentId)
          if (replyCache) {
            commentCache.setReplies(parentId, {
              replies: replyCache.replies.map(r =>
                r.id === commentId
                  ? { ...r, myReaction: result.liked ? 'like' : null, likeCount: result.likeCount }
                  : r
              ),
              nextCursorId: replyCache.nextCursorId,
            })
          }
        }
        captureAndUpdateState(result.liked, result.likeCount)
        // Success callback
        if (result.liked) {
          onLikeSuccess?.()
        } else {
          onUnlikeSuccess?.()
        }
      } catch (error) {
        // Revert optimistic update
        if (previousCache) {
          commentCache.updateComment(postId, commentId, {
            myReaction: previousCache.myReaction ?? null,
            likeCount: previousCache.likeCount,
          })
        }
        if (parentId && previousReplyCache) {
          const replyCache = commentCache.getReplies(parentId)
          if (replyCache) {
            commentCache.setReplies(parentId, {
              replies: replyCache.replies.map(r =>
                r.id === commentId
                  ? { ...r, myReaction: previousReplyCache.myReaction ?? null, likeCount: previousReplyCache.likeCount }
                  : r
              ),
              nextCursorId: replyCache.nextCursorId,
            })
          }
        }
        if (previousState) {
          updateCommentState?.(commentId, () => previousState as ApiComment)
        }
        onError?.(error instanceof Error ? error : new Error('Failed to like comment'))
        throw error
      }
    },
    [postId, onError, onLikeSuccess, onUnlikeSuccess, updateCommentState]
  )

  const handleDelete = useCallback(
    async (commentId: string, isReply: boolean, parentId?: string) => {
      // Optimistic update
      const cached = commentCache.get(postId)
      if (cached) {
        if (isReply && parentId) {
          // Update parent's replyCount
          const parent = cached.comments.find(c => c.id === parentId)
          if (parent && parent.replyCount !== undefined) {
            commentCache.updateComment(postId, parentId, {
              replyCount: Math.max(0, parent.replyCount - 1),
            })
          }
          updateParentReplyCount?.(parentId, -1)
          // Remove from reply cache
          const replyCache = commentCache.getReplies(parentId)
          if (replyCache) {
            commentCache.setReplies(parentId, {
              replies: replyCache.replies.filter(r => r.id !== commentId),
              nextCursorId: replyCache.nextCursorId,
            })
          }
        } else {
          // Remove root comment
          commentCache.set(postId, {
            comments: cached.comments.filter(c => c.id !== commentId),
            nextCursorId: cached.nextCursorId,
          })
          removeCommentState?.(commentId)
        }
      }

      try {
        await deleteComment(commentId)
        // Comment already removed optimistically
        onDeleteSuccess?.()
      } catch (error) {
        // Revert would require refetching - just show error
        onError?.(error instanceof Error ? error : new Error('Failed to delete comment'))
        throw error
      }
    },
    [postId, onError, onDeleteSuccess, removeCommentState, updateParentReplyCount]
  )

  const handleEdit = useCallback(
    async (commentId: string, newBody: string) => {
      let previousState: ApiComment | null = null
      let previousCache: { body: string; mentionedUserIds: string[] } | null = null
      const captureAndUpdateState = () => {
        updateCommentState?.(commentId, current => {
          if (!previousState) {
            previousState = current
          }
          return {
            ...current,
            body: newBody,
          }
        })
      }
      // Optimistic update
      const cached = commentCache.get(postId)
      if (cached) {
        const comment = cached.comments.find(c => c.id === commentId)
        if (comment) {
          previousCache = {
            body: comment.body,
            mentionedUserIds: comment.mentionedUserIds,
          }
          commentCache.updateComment(postId, commentId, {
            body: newBody,
            // Keep existing mentionedUserIds until server responds
          })
        }
      }
      captureAndUpdateState()

      try {
        const result = await editComment(commentId, { body: newBody })
        // Update with server response
        commentCache.updateComment(postId, commentId, {
          body: result.body,
          mentionedUserIds: result.mentionedUserIds,
        })
        updateCommentState?.(commentId, current => ({
          ...current,
          body: result.body,
          mentionedUserIds: result.mentionedUserIds,
        }))
      } catch (error) {
        // Revert optimistic update
        if (previousCache) {
          commentCache.updateComment(postId, commentId, {
            body: previousCache.body,
            mentionedUserIds: previousCache.mentionedUserIds,
          })
        }
        if (previousState) {
          updateCommentState?.(commentId, () => previousState as ApiComment)
        }
        onError?.(error instanceof Error ? error : new Error('Failed to edit comment'))
        throw error
      }
    },
    [postId, onError, updateCommentState]
  )

  return {
    handleLike,
    handleDelete,
    handleEdit,
  }
}
