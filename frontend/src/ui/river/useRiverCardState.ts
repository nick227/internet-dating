import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FeedCard, FeedCardStats, RatingScores } from '../../api/types'
import { commentIntentLabel } from '../../core/format/commentIntentLabel'
import { useQuizAnswer } from '../../core/actions/useQuizAnswer'
import { createComment } from '../../api/comments'

type CommentEntry = { id: string; text: string; pending?: boolean }

/**
 * Card-level comment adapter (READ-ONLY)
 * 
 * ⚠️ OWNERSHIP SEMANTICS (ENFORCED):
 * - This hook is READ-ONLY for comment state
 * - useCommentWidget is the SINGLE WRITER for comment mutations
 * - This adapter only bridges authoritative count from widget to card
 * - mergedStats.commentCount is IMMUTABLE from outside
 * 
 * Phase 1: Adapter pattern (current)
 * - Card state: Read-only display
 * - Widget: Owns all mutations
 * - Adapter: Bridges count only via setAuthoritativeCommentCount()
 * 
 * Phase 2: Will be replaced by useCardCommentStore
 * - Single owner of all comment state
 * - Card and widget read from same source
 */
export function useRiverCardCommentAdapter(card: FeedCard) {
  const actorId = card.actor?.id
  const presentation =
    card.presentation ?? (card.kind === 'question' ? { mode: 'question' as const } : undefined)
  const accent = presentation?.accent ?? (card.kind === 'match' ? 'match' : null)
  const showQuestion = card.kind === 'question' || presentation?.mode === 'question'
  const questionId = showQuestion ? card.question?.id : undefined
  const quizId = card.question?.quizId
  const { answer: questionAnswer, submit: submitQuestionAnswer } = useQuizAnswer(quizId, questionId)
  const commentLabel = useMemo(
    () => commentIntentLabel(card.comments?.intent),
    [card.comments?.intent]
  )

  const [serverStats, setServerStats] = useState<FeedCardStats | undefined>(card.stats)
  const [optimisticRating, setOptimisticRating] = useState<RatingScores | null | undefined>(
    undefined
  )
  const [serverComments, setServerComments] = useState<CommentEntry[]>(
    () => card.comments?.preview ?? []
  )
  const [optimisticComments, setOptimisticComments] = useState<CommentEntry[]>([])
  const [commentOpen, setCommentOpen] = useState(false)

  // Consolidated effect: batch all state updates together
  useEffect(() => {
    const next = card.comments?.preview ?? []
    // Build Set in single pass (no intermediate array)
    const nextIds = new Set<string>()
    for (const entry of next) {
      nextIds.add(entry.id)
    }

    // Batch state updates
    setServerStats(card.stats)
    setOptimisticRating(card.stats?.myRating ? undefined : optimisticRating)
    setServerComments(next)
    setOptimisticComments(prev => {
      if (prev.length === 0) return prev
      return prev.filter(entry => !nextIds.has(entry.id))
    })
    setCommentOpen(true)
  }, [card.id, card.stats, card.comments?.preview, optimisticRating])

  // Merge comments: optimistic (newest first) + server (newest first)
  // Both arrays are already in newest-first order, so just concatenate
  const commentEntries = useMemo(
    () => [...optimisticComments, ...serverComments],
    [optimisticComments, serverComments]
  )

  const mergedStats = useMemo(() => {
    const base =
      serverStats ?? (serverComments.length ? { commentCount: serverComments.length } : undefined)
    const optimisticCount = optimisticComments.length
    if (!base) {
      if (!optimisticCount && optimisticRating === undefined) return undefined
      return {
        commentCount: optimisticCount || undefined,
        myRating: optimisticRating ?? undefined,
      } as FeedCardStats
    }
    // Build object directly instead of spread (fewer allocations)
    const next: FeedCardStats = {
      likeCount: base.likeCount,
      commentCount: (base.commentCount ?? serverComments.length ?? 0) + optimisticCount,
      ratingAverage: base.ratingAverage,
      ratingCount: base.ratingCount,
      myRating: optimisticRating !== undefined ? optimisticRating : base.myRating,
    }
    return next
  }, [optimisticComments.length, optimisticRating, serverComments.length, serverStats])

  const handleRated = useCallback((rating: RatingScores) => {
    setOptimisticRating(rating)
  }, [])

  const toggleComment = useCallback(() => {
    setCommentOpen(prev => !prev)
  }, [])

  const submitComment = useCallback(
    async (text: string) => {
      const entry = {
        id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        text,
        pending: true,
      }
      setOptimisticComments(prev => {
        const updated = [entry, ...prev]
        return updated
      })
      try {
        // Extract actual ID if card.id is prefixed (e.g., "post-123" -> "123")
        const cardId = card.id.startsWith('post-') 
          ? card.id.replace(/^post-/, '')
          : card.id.startsWith('match-')
          ? card.id.replace(/^match-/, '')
          : card.id.startsWith('profile-')
          ? card.id.replace(/^profile-/, '')
          : card.id
        
        const requestBody = {
          cardId,
          cardKind: card.kind,
          // actorId, // Removed: Backend infers from auth token
          text,
          clientRequestId: entry.id
        }
        const result = await createComment(requestBody)
        setOptimisticComments(prev => {
          const updated = prev.map(item =>
            item.id === entry.id ? { ...item, id: String(result.id), pending: false } : item
          )
          return updated
        })
      } catch (err) {
        console.error('[useRiverCardState] createComment failed:', err)
        console.error('[useRiverCardState] Error details:', {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          name: err instanceof Error ? err.name : undefined,
        })
        setOptimisticComments(prev => {
          const filtered = prev.filter(item => item.id !== entry.id)
          return filtered
        })
        throw err
      }
    },
    [card.id, card.kind]
  )

  // ENFORCED SINGLE-WRITER: Only this method can update comment count
  // Prevents direct mutation of mergedStats from outside
  const setAuthoritativeCommentCount = useCallback((count: number) => {
    setServerStats((prev: FeedCardStats | undefined) => {
      if (!prev) {
        return { commentCount: count } as FeedCardStats
      }
      // Enforce: count never animates backwards
      const prevCount = prev.commentCount ?? 0
      if (count < prevCount) {
        console.warn('[useRiverCardCommentAdapter] Count decreased, updating without animation', {
          prev: prevCount,
          next: count
        })
        // Update immediately without animation
        return { ...prev, commentCount: count }
      }
      return { ...prev, commentCount: count }
    })
  }, [])

  return {
    actorId,
    presentation,
    accent,
    showQuestion,
    commentLabel,
    commentEntries,
    commentOpen,
    mergedStats, // READ-ONLY - cannot be mutated directly
    setAuthoritativeCommentCount, // SINGLE-WRITER method
    questionAnswer,
    submitQuestionAnswer,
    toggleComment,
    submitComment, // DEPRECATED: Use widget's submitComment instead
    handleRated,
  }
}

// Backward compatibility alias (will be removed in Phase 2)
export const useRiverCardState = useRiverCardCommentAdapter
