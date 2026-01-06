import { useState, useEffect } from 'react'
import { api } from '../../../api/client'
import type { QuizResults } from './types'

export function useQuizResults(quizId?: string) {
  const [data, setData] = useState<QuizResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!quizId) {
      setError(new Error('Quiz ID required'))
      setLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()

    api.quizzes.results(quizId, controller.signal)
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [quizId])

  return { data, loading, error }
}
