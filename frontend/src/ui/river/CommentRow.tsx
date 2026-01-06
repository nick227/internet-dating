import { memo, useCallback, useMemo, useState } from 'react'
import type { ApiComment } from '../../api/comments'

type CommentRowProps = {
  comment: ApiComment
  depth?: number // 0 = root, 1 = reply
  onLike: (commentId: string, currentLiked: boolean) => Promise<void>
  onReply: (commentId: string, parentAuthorName: string) => void
  onMentionClick: (userId: string) => void
  onDelete?: (commentId: string) => void
  isAuthor?: boolean
}

/**
 * Component for displaying a single comment
 * SRP: Renders comment UI with avatar, name, text, actions
 */
function CommentRowComponent({
  comment,
  depth = 0,
  onLike,
  onReply,
  onMentionClick,
  onDelete,
  isAuthor = false,
}: CommentRowProps) {
  const isReply = depth > 0
  const isLiked = comment.myReaction === 'like'
  const [isAnimating, setIsAnimating] = useState(false)
  
  // Check if comment is optimistic (has clientRequestId but no server ID yet)
  // Optimistic comments have IDs starting with 'local-' or are marked as pending
  const isOptimistic = comment.id.startsWith('local-') || (comment as { pending?: boolean }).pending === true

  // Format relative time
  const timeAgo = useMemo(() => {
    const date = new Date(comment.createdAt)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'now'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`
    return date.toLocaleDateString()
  }, [comment.createdAt])

  // Parse mentions in body text
  const renderBody = useCallback(() => {
    if (!comment.body) return null

    const parts: Array<{ text: string; isMention: boolean; userId?: string }> = []
    const mentionPattern = /@([a-zA-Z0-9_-]+)/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = mentionPattern.exec(comment.body)) !== null) {
      // Add text before mention
      if (match.index > lastIndex) {
        parts.push({ text: comment.body.slice(lastIndex, match.index), isMention: false })
      }

      // Check if this mention matches a userId
      const mentionedUserId = comment.mentionedUserIds.find(() => {
        // In a real implementation, we'd need to fetch user info to match username
        // For now, we'll just check if any userId exists (simplified)
        return true // Simplified - would need user lookup
      })

      if (mentionedUserId) {
        parts.push({
          text: `@${match[1]}`,
          isMention: true,
          userId: mentionedUserId,
        })
      } else {
        parts.push({ text: `@${match[1]}`, isMention: false })
      }

      lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < comment.body.length) {
      parts.push({ text: comment.body.slice(lastIndex), isMention: false })
    }

    if (parts.length === 0) {
      return comment.body
    }

    return (
      <>
        {parts.map((part, idx) => {
          if (part.isMention && part.userId) {
            return (
              <button
                key={idx}
                type="button"
                className="commentRow__mention"
                onClick={() => onMentionClick(part.userId!)}
              >
                {part.text}
              </button>
            )
          }
          return <span key={idx}>{part.text}</span>
        })}
      </>
    )
  }, [comment.body, comment.mentionedUserIds, onMentionClick])

  return (
    <div
      className={`commentRow ${isReply ? 'commentRow--reply' : ''} ${isOptimistic ? 'commentRow--optimistic' : ''}`}
      aria-busy={isOptimistic}
    >
      <div className="commentRow__header">
        <div className="commentRow__author">
          {comment.author.avatarUrl ? (
            <img
              src={comment.author.avatarUrl}
              alt={comment.author.name}
              className="commentRow__avatar"
            />
          ) : (
            <div className="commentRow__avatar commentRow__avatar--placeholder">
              {comment.author.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="commentRow__authorInfo">
            <span className="commentRow__name">{comment.author.name}</span>
            <span className="commentRow__time">{timeAgo}</span>
          </div>
        </div>
        {isAuthor && onDelete && (
          <button
            type="button"
            className="commentRow__delete"
            onClick={() => onDelete(comment.id)}
            aria-label="Delete comment"
          >
            ×
          </button>
        )}
      </div>

      <div className="commentRow__body">{renderBody()}</div>

      <div className="commentRow__actions">
        <button
          type="button"
          className={`commentRow__action commentRow__action--like ${isLiked ? 'commentRow__action--active' : ''} ${isAnimating ? 'commentRow__action--animating' : ''}`}
          onClick={() => {
            // Native-style feedback
            setIsAnimating(true)
            
            // Haptic feedback (where supported)
            if ('vibrate' in navigator) {
              try {
                navigator.vibrate(10)
              } catch {
                // Ignore errors
              }
            }

            void onLike(comment.id, isLiked)
            
            // Reset animation after completion
            setTimeout(() => setIsAnimating(false), 300)
          }}
          aria-label={isLiked ? 'Unlike' : 'Like'}
        >
          <span className="commentRow__actionIcon">♥</span>
          {comment.likeCount > 0 && (
            <span className="commentRow__actionCount">{comment.likeCount}</span>
          )}
        </button>
        <button
          type="button"
          className="commentRow__action commentRow__action--reply"
          onClick={() => onReply(comment.id, comment.author.name)}
          aria-label="Reply"
        >
          Reply
        </button>
      </div>
    </div>
  )
}

export const CommentRow = memo(CommentRowComponent)
