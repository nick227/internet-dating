import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FeedCard, FeedCardStats, RatingScores } from '../../api/types'
import { commentIntentLabel } from '../../core/format/commentIntentLabel'
import { useQuizAnswer } from '../../core/actions/useQuizAnswer'
import { createComment } from '../../api/comments'

type CommentEntry = { id: string; text: string; pending?: boolean }

export function useRiverCardState(card: FeedCard) {
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
    setCommentOpen(false)
  }, [card.id, card.stats, card.comments?.preview, optimisticRating])

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
      setOptimisticComments(prev => [entry, ...prev])
      try {
        await createComment({ cardId: card.id, cardKind: card.kind, actorId, text })
        setOptimisticComments(prev =>
          prev.map(item => (item.id === entry.id ? { ...item, pending: false } : item))
        )
      } catch (err) {
        setOptimisticComments(prev => prev.filter(item => item.id !== entry.id))
        throw err
      }
    },
    [actorId, card.id, card.kind]
  )

  return {
    actorId,
    presentation,
    accent,
    showQuestion,
    commentLabel,
    commentEntries,
    commentOpen,
    mergedStats,
    questionAnswer,
    submitQuestionAnswer,
    toggleComment,
    submitComment,
    handleRated,
  }
}
