import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { Id } from '../../api/types'

type StoredAnswers = Record<string, string>

const STORAGE_KEY = 'river.quiz.answers'

function loadAnswers(): StoredAnswers {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as StoredAnswers
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveAnswers(next: StoredAnswers) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore storage failures
  }
}

export function useQuizAnswer(quizId?: Id, questionId?: string) {
  const [answer, setAnswer] = useState<string | null>(() => {
    if (!questionId) return null
    const stored = loadAnswers()
    return stored[questionId] ?? null
  })

  useEffect(() => {
    if (!questionId) {
      setAnswer(null)
      return
    }
    const stored = loadAnswers()
    setAnswer(stored[questionId] ?? null)
  }, [questionId])

  const submit = useCallback(
    async (value: string) => {
      if (!questionId) return
      const prev = answer
      setAnswer(value)
      try {
        if (quizId) {
          await api.quizzes.submit(quizId, { answers: { [questionId]: value } })
        }
        const stored = loadAnswers()
        stored[questionId] = value
        saveAnswers(stored)
      } catch (err) {
        setAnswer(prev ?? null)
        throw err
      }
    },
    [answer, questionId, quizId]
  )

  return { answer, submit }
}
