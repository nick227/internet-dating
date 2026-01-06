import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiComment } from '../../api/comments'
import { getComments, createComment } from '../../api/comments'
import { commentCache } from '../../core/comments/commentCache'

// ============================================================================
// Constants & Types
// ============================================================================

const COMMENTS_PER_PAGE = 20
const OPTIMISTIC_TIMEOUT_MS = 60000 // Remove optimistic comments after 60s if not acknowledged

type UseCommentWidgetOptions = {
  postId: string
  isOpen: boolean
  initialCommentCount?: number
  onError?: (error: Error) => void
}

// ============================================================================
// Optimistic Comment Management
// ============================================================================

/**
 * Optimistic comment with tracking metadata.
 * Uses timestamp to handle expiry of stuck optimistic comments.
 */
type OptimisticComment = {
  clientRequestId: string // Original client ID (immutable)
  serverId?: string
  acknowledged: boolean
  comment: ApiComment
  timestamp: number // When created (for expiry/ordering)
}

/**
 * Manages optimistic comments with clear lifecycle.
 * 
 * Flow:
 * 1. add() - Create optimistic comment (clientRequestId used until ack)
 * 2. acknowledge() - Server responds with real ID
 * 3. removeConfirmed() - Remove once server ID is seen in the current list
 * 4. remove() - Explicitly remove on error
 */
class OptimisticTracker {
  // clientRequestId -> OptimisticComment
  private readonly pending = new Map<string, OptimisticComment>()
  
  add(clientRequestId: string, comment: ApiComment): void {
    this.pending.set(clientRequestId, {
      clientRequestId,
      acknowledged: false,
      comment: { ...comment },
      timestamp: Date.now(),
    })
  }
  
  acknowledge(clientRequestId: string, serverId: string, serverCreatedAt: string): void {
    const opt = this.pending.get(clientRequestId)
    if (opt) {
      opt.serverId = serverId
      opt.acknowledged = true
      opt.comment = {
        ...opt.comment,
        id: serverId,
        createdAt: serverCreatedAt,
      }
    }
  }
  
  remove(clientRequestId: string): void {
    this.pending.delete(clientRequestId)
  }
  
  getAll(): OptimisticComment[] {
    return Array.from(this.pending.values())
  }
  
  /**
   * Remove confirmed and expired optimistic comments.
   * Returns removed client IDs for caller awareness.
   */
  removeConfirmed(seenServerIds: Set<string>): string[] {
    const now = Date.now()
    const removed: string[] = []
    
    for (const [clientRequestId, opt] of this.pending.entries()) {
      // Remove if server ID is seen in the active list, or if unacked and expired.
      if (opt.acknowledged && opt.serverId && seenServerIds.has(opt.serverId)) {
        removed.push(clientRequestId)
      } else if (!opt.acknowledged && now - opt.timestamp > OPTIMISTIC_TIMEOUT_MS) {
        removed.push(clientRequestId)
      }
    }
    
    removed.forEach(id => this.pending.delete(id))
    return removed
  }
  
  clear(): void {
    this.pending.clear()
  }
}

/**
 * Merge optimistic and server comments.
 * 
 * Rules:
 * - Server comments are authoritative (keep their order from API)
 * - Optimistic comments appear first (recent sorted by timestamp, popular keeps insertion order)
 * - No duplicate IDs
 */
function mergeComments(
  serverComments: ApiComment[],
  optimisticComments: OptimisticComment[],
  sort: 'recent' | 'popular'
): ApiComment[] {
  const serverIds = new Set(serverComments.map(c => c.id))
  
  // Only keep optimistic comments not yet present in server results
  const pending = optimisticComments.filter(opt => {
    const idToCheck = opt.serverId ?? opt.comment.id
    return !serverIds.has(idToCheck)
  })
  const orderedPending =
    sort === 'recent' ? [...pending].sort((a, b) => b.timestamp - a.timestamp) : pending
  const optimisticOutput = orderedPending.map(opt => ({ ...opt.comment }))
  
  // Server comments maintain their API order (already sorted by selected sort)
  return [...optimisticOutput, ...serverComments]
}

// ============================================================================
// Client Request ID Generation
// ============================================================================

function generateClientRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `local-${crypto.randomUUID()}`
  }
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 15) + 
                 Math.random().toString(36).slice(2, 15)
  return `local-${timestamp}-${random}`
}

// ============================================================================
// Main Hook
// ============================================================================

export function useCommentWidget({
  postId,
  isOpen,
  initialCommentCount: _initialCommentCount,
  onError,
}: UseCommentWidgetOptions) {
  // -------------------------------------------------------------------------
  // State: Core Data
  // -------------------------------------------------------------------------
  const [comments, setComments] = useState<ApiComment[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursorId, setNextCursorId] = useState<string | undefined>()
  const [sort, setSort] = useState<'recent' | 'popular'>('recent')

  // -------------------------------------------------------------------------
  // State: Submission Tracking
  // -------------------------------------------------------------------------
  // Track active submission by type (simple count)
  const [submittingCounts, setSubmittingCounts] = useState<{
    root: number
    reply: number
  }>({ root: 0, reply: 0 })

  // -------------------------------------------------------------------------
  // Refs: Non-reactive State
  // -------------------------------------------------------------------------
  const optimisticTracker = useRef(new OptimisticTracker())
  const seenServerIdsRef = useRef<Set<string>>(new Set())
  const abortControllerRef = useRef<AbortController | null>(null)
  const currentSortRef = useRef(sort)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  
  // Keep sort ref in sync with state
  useEffect(() => {
    currentSortRef.current = sort
  }, [sort])

  // Reset seen server IDs when post or sort changes
  useEffect(() => {
    seenServerIdsRef.current.clear()
  }, [postId, sort])

  // -------------------------------------------------------------------------
  // Helper: Safe Error Reporting
  // -------------------------------------------------------------------------
  const reportError = useCallback((error: unknown, context: string) => {
    const err = error instanceof Error ? error : new Error(`${context}: ${error}`)
    onErrorRef.current?.(err)
  }, [])

  // -------------------------------------------------------------------------
  // Data Loading
  // -------------------------------------------------------------------------
  const loadComments = useCallback(
    async (cursorId?: string, append = false): Promise<ApiComment[]> => {
      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      const controller = new AbortController()
      abortControllerRef.current = controller
      const requestSort = currentSortRef.current // Use ref to get current value

      // Check cache first (only for initial load)
      if (!cursorId && !append) {
        const cached = commentCache.get(postId)
        if (cached?.comments.length) {
          const seenServerIds = seenServerIdsRef.current
          cached.comments.forEach(comment => seenServerIds.add(comment.id))
          optimisticTracker.current.removeConfirmed(seenServerIds)
          const merged = mergeComments(
            cached.comments,
            optimisticTracker.current.getAll(),
            requestSort
          )
          setComments(merged)
          setNextCursorId(cached.nextCursorId)
          setHasMore(!!cached.nextCursorId)
          // Continue to fetch fresh data below
        }
      }

      try {
        // Set loading state
        if (append) {
          setLoadingMore(true)
        } else if (!cursorId) {
          setLoading(true)
        }

        // Fetch from API
        const result = await getComments(
          postId,
          'post',
          { cursorId, take: COMMENTS_PER_PAGE, sort: requestSort },
          controller.signal
        )

        // Check if aborted or sort changed during request
        if (controller.signal.aborted || requestSort !== currentSortRef.current) return []

        const newComments = result.comments
        const seenServerIds = seenServerIdsRef.current
        newComments.forEach(comment => seenServerIds.add(comment.id))
        optimisticTracker.current.removeConfirmed(seenServerIds)

        // Get optimistic comments once before state update (avoid recalculating in setState)
        const allOptimistic = optimisticTracker.current.getAll()
        const optimisticIds = new Set(allOptimistic.map(opt => opt.comment.id))

        // Update state with merge
        setComments(prev => {
          if (append) {
            // Extract clean server data from prev (remove optimistic)
            const prevServer = prev.filter(c => !optimisticIds.has(c.id))
            
            // Deduplicate new comments against previous server data
            const existingIds = new Set(prevServer.map(c => c.id))
            const unique = newComments.filter(c => !existingIds.has(c.id))
            
            // Combine all server data, then merge with optimistic
            const allServer = [...prevServer, ...unique]
            return mergeComments(allServer, allOptimistic, requestSort)
          } else {
            // Replace with new server data, merge with optimistic
            return mergeComments(newComments, allOptimistic, requestSort)
          }
        })

        setNextCursorId(result.nextCursorId)
        setHasMore(!!result.nextCursorId)

        // Update cache with server data only
        try {
          if (append) {
            commentCache.append(postId, {
              comments: newComments,
              nextCursorId: result.nextCursorId,
            })
          } else {
            commentCache.set(postId, {
              comments: newComments,
              nextCursorId: result.nextCursorId,
            })
          }
        } catch (cacheError) {
          // Cache errors are not critical
          reportError(cacheError, 'Cache update failed')
        }

        return newComments
      } catch (error) {
        if (controller.signal.aborted) return []
        if (error instanceof Error && error.name === 'AbortError') return []
        
        reportError(error, 'Failed to load comments')
        return []
      } finally {
        // Only clear loading state if this request is still valid (not aborted, sort unchanged)
        if (!controller.signal.aborted && requestSort === currentSortRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [postId, reportError]
  )

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || !nextCursorId) return
    void loadComments(nextCursorId, true)
  }, [loadComments, loadingMore, hasMore, nextCursorId])

  // -------------------------------------------------------------------------
  // Comment Submission
  // -------------------------------------------------------------------------
  const submitComment = useCallback(
    async (text: string, parentId?: string): Promise<void> => {
      const clientRequestId = generateClientRequestId()
      const isReply = !!parentId

      // Increment submitting count
      setSubmittingCounts(prev => ({
        ...prev,
        [isReply ? 'reply' : 'root']: prev[isReply ? 'reply' : 'root'] + 1,
      }))

      // Update UI immediately
      if (isReply) {
        // For replies: increment parent's reply count
        setComments(prev =>
          prev.map(c =>
            c.id === parentId
              ? { ...c, replyCount: (c.replyCount ?? 0) + 1 }
              : c
          )
        )
      } else {
        // Create optimistic comment (root only)
        const optimisticComment: ApiComment = {
          id: clientRequestId,
          body: text,
          author: { id: 'me', name: 'You' },
          createdAt: new Date().toISOString(),
          likeCount: 0,
          replyCount: 0,
          myReaction: null,
          mentionedUserIds: [],
        }

        // Add to tracker (root only)
        optimisticTracker.current.add(clientRequestId, optimisticComment)

        // For root: extract server comments from prev, then merge with all optimistic
        // Get optimistic IDs before setState to avoid stale closures
        const allOptimistic = optimisticTracker.current.getAll()
        const optimisticIds = new Set(allOptimistic.map(opt => opt.comment.id))
        
        setComments(prev => {
          // Extract clean server data from prev (remove all optimistic)
          const serverComments = prev.filter(c => !optimisticIds.has(c.id))
          // Merge with all optimistic (including new one)
          return mergeComments(serverComments, allOptimistic, currentSortRef.current)
        })
      }

      try {
        // Submit to server
        const result = await createComment({
          cardId: postId,
          cardKind: 'post',
          text,
          parentId,
          clientRequestId,
        })

        if (!result.id) {
          throw new Error('Server did not return comment ID')
        }

        const serverId = String(result.id)

        if (!isReply) {
          // Update optimistic comment with server ID and timestamp
          optimisticTracker.current.acknowledge(clientRequestId, serverId, result.createdAt)

          // Update state with server ID
          setComments(prev =>
            prev.map(c =>
              c.id === clientRequestId
                ? { ...c, id: serverId, createdAt: result.createdAt }
                : c
            )
          )
        }

        // Reload to get full comment data from server (author info, mentions, etc.)
        // The API only returns id and createdAt, so we need to fetch full data
        try {
          await loadComments()
        } catch (reloadError) {
          // Reload failure is non-critical - comment is already posted and visible
          // User will see full data on next natural reload
          reportError(reloadError, 'Failed to reload comment data')
        }

        return
      } catch (error) {
        // Rollback optimistic changes
        if (!isReply) {
          optimisticTracker.current.remove(clientRequestId)
        }

        if (isReply) {
          // Restore parent reply count
          setComments(prev =>
            prev.map(c =>
              c.id === parentId && c.replyCount !== undefined
                ? { ...c, replyCount: Math.max(0, c.replyCount - 1) }
                : c
            )
          )
        } else {
          // Remove optimistic root comment
          // Tracker already removed it, so just filter from state
          setComments(prev => prev.filter(c => c.id !== clientRequestId))
        }

        const err = error instanceof Error ? error : new Error('Failed to post comment')
        reportError(err, 'Comment submission failed')
        throw err
      } finally {
        // Decrement submitting count
        setSubmittingCounts(prev => ({
          ...prev,
          [isReply ? 'reply' : 'root']: Math.max(0, prev[isReply ? 'reply' : 'root'] - 1),
        }))
      }
    },
    [postId, loadComments, reportError]
  )

  // -------------------------------------------------------------------------
  // Effects: Load on Open/Sort Change
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) {
      // Abort requests when closed
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      return
    }

    // Reset pagination on sort change
    setNextCursorId(undefined)
    setHasMore(false)

    void loadComments()

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [isOpen, sort, loadComments]) // loadComments is stable (no sort dependency), effect re-runs on sort change

  // -------------------------------------------------------------------------
  // Effects: Cleanup on Unmount
  // -------------------------------------------------------------------------
  useEffect(() => {
    const tracker = optimisticTracker.current
    const sortRef = currentSortRef
    return () => {
      tracker.clear()
      // Reset ref on unmount (minor cleanup)
      sortRef.current = 'recent'
    }
  }, [])

  // -------------------------------------------------------------------------
  // Return API
  // -------------------------------------------------------------------------
  const isSubmittingRoot = submittingCounts.root > 0
  const isSubmittingReply = submittingCounts.reply > 0
  const updateCommentState = useCallback(
    (commentId: string, updater: (comment: ApiComment) => ApiComment) => {
      setComments(prev =>
        prev.map(comment => (comment.id === commentId ? updater(comment) : comment))
      )
    },
    []
  )
  const removeCommentState = useCallback((commentId: string) => {
    setComments(prev => prev.filter(comment => comment.id !== commentId))
  }, [])
  const updateParentReplyCount = useCallback((parentId: string, delta: number) => {
    setComments(prev =>
      prev.map(comment => {
        if (comment.id !== parentId || comment.replyCount === undefined) {
          return comment
        }
        return {
          ...comment,
          replyCount: Math.max(0, comment.replyCount + delta),
        }
      })
    )
  }, [])

  return {
    // Data
    comments,
    loading,
    loadingMore,
    hasMore,
    
    // Controls
    sort,
    setSort,
    loadMore,
    submitComment,
    updateCommentState,
    removeCommentState,
    updateParentReplyCount,
    reload: () => loadComments(),
    
    // Status
    isSubmitting: isSubmittingRoot || isSubmittingReply,
    isSubmittingRoot,
    isSubmittingReply,
  }
}
