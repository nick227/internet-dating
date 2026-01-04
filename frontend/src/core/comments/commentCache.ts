/**
 * LRU cache for comments per post
 * 
 * Features:
 * - LRU eviction (max 20 posts)
 * - Invalidation on new comment
 * - Merge optimistic updates
 * - Deduplicate by ID
 */

export type Comment = {
  id: string
  body: string
  author: {
    id: string
    name: string
    avatarUrl?: string
  }
  createdAt: string
  likeCount: number
  replyCount?: number
  myReaction?: 'like' | null
  mentionedUserIds: string[]
  pending?: boolean
}

type PostComments = {
  comments: Comment[]
  nextCursorId?: string
  lastAccessed: number
}

type ReplyCache = {
  replies: Comment[]
  nextCursorId?: string
  lastAccessed: number
}

const MAX_POSTS = 20
const MAX_REPLIES_PER_COMMENT = 50

class CommentCache {
  private postCache = new Map<string, PostComments>()
  private replyCache = new Map<string, ReplyCache>()

  // Get comments for a post
  get(postId: string): PostComments | null {
    const cached = this.postCache.get(postId)
    if (cached) {
      cached.lastAccessed = Date.now()
      return cached
    }
    return null
  }

  // Set comments for a post
  set(postId: string, data: { comments: Comment[]; nextCursorId?: string }) {
    // Evict if needed
    if (this.postCache.size >= MAX_POSTS && !this.postCache.has(postId)) {
      this.evictOldest()
    }

    this.postCache.set(postId, {
      ...data,
      lastAccessed: Date.now(),
    })
  }

  // Append comments (for pagination)
  append(postId: string, data: { comments: Comment[]; nextCursorId?: string }) {
    const existing = this.get(postId)
    if (existing) {
      // Deduplicate by ID
      const existingIds = new Set(existing.comments.map(c => c.id))
      const newComments = data.comments.filter(c => !existingIds.has(c.id))
      this.set(postId, {
        comments: [...existing.comments, ...newComments],
        nextCursorId: data.nextCursorId,
      })
    } else {
      this.set(postId, data)
    }
  }

  // Add optimistic comment
  addOptimistic(postId: string, comment: Comment) {
    const existing = this.get(postId)
    if (existing) {
      // Check if already exists (by ID or clientRequestId)
      const exists = existing.comments.some(c => c.id === comment.id)
      if (!exists) {
        this.set(postId, {
          comments: [comment, ...existing.comments],
          nextCursorId: existing.nextCursorId,
        })
      }
    }
  }

  // Update comment (for edits, likes)
  updateComment(postId: string, commentId: string, updates: Partial<Comment> & { id?: string }) {
    const existing = this.get(postId)
    if (existing) {
      const updated = existing.comments.map(c =>
        c.id === commentId ? { ...c, ...updates } : c
      )
      this.set(postId, {
        comments: updated,
        nextCursorId: existing.nextCursorId,
      })
    }
  }

  // Remove comment (for deletes)
  removeComment(postId: string, commentId: string) {
    const existing = this.get(postId)
    if (existing) {
      const filtered = existing.comments.filter(c => c.id !== commentId)
      this.set(postId, {
        comments: filtered,
        nextCursorId: existing.nextCursorId,
      })
    }
  }

  // Get replies for a comment
  getReplies(commentId: string): ReplyCache | null {
    const cached = this.replyCache.get(commentId)
    if (cached) {
      cached.lastAccessed = Date.now()
      return cached
    }
    return null
  }

  // Set replies for a comment
  setReplies(commentId: string, data: { replies: Comment[]; nextCursorId?: string }) {
    if (this.replyCache.size >= MAX_REPLIES_PER_COMMENT && !this.replyCache.has(commentId)) {
      this.evictOldestReplies()
    }

    this.replyCache.set(commentId, {
      ...data,
      lastAccessed: Date.now(),
    })
  }

  // Append replies (for pagination)
  appendReplies(commentId: string, data: { replies: Comment[]; nextCursorId?: string }) {
    const existing = this.getReplies(commentId)
    if (existing) {
      const existingIds = new Set(existing.replies.map(r => r.id))
      const newReplies = data.replies.filter(r => !existingIds.has(r.id))
      this.setReplies(commentId, {
        replies: [...existing.replies, ...newReplies],
        nextCursorId: data.nextCursorId,
      })
    } else {
      this.setReplies(commentId, data)
    }
  }

  // Add optimistic reply
  addOptimisticReply(commentId: string, reply: Comment) {
    const existing = this.getReplies(commentId)
    if (existing) {
      const exists = existing.replies.some(r => r.id === reply.id)
      if (!exists) {
        this.setReplies(commentId, {
          replies: [...existing.replies, reply],
          nextCursorId: existing.nextCursorId,
        })
      }
    } else {
      this.setReplies(commentId, { replies: [reply] })
    }
  }

  // Invalidate post cache
  invalidate(postId: string) {
    this.postCache.delete(postId)
  }

  // Clear all
  clear() {
    this.postCache.clear()
    this.replyCache.clear()
  }

  // Evict oldest post
  private evictOldest() {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, value] of this.postCache.entries()) {
      if (value.lastAccessed < oldestTime) {
        oldestTime = value.lastAccessed
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.postCache.delete(oldestKey)
    }
  }

  // Evict oldest reply cache
  private evictOldestReplies() {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, value] of this.replyCache.entries()) {
      if (value.lastAccessed < oldestTime) {
        oldestTime = value.lastAccessed
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.replyCache.delete(oldestKey)
    }
  }
}

// Singleton instance
export const commentCache = new CommentCache()
