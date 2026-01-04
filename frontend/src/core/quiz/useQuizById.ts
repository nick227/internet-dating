import { api, type ApiQuizResponse } from '../../api/client'
import { useAsync } from '../hooks/useAsync'

export function useQuizById(quizId?: string) {
  return useAsync<ApiQuizResponse>(
    signal => {
      if (!quizId) {
        return Promise.resolve({ quiz: null })
      }
      return api.quizzes.byId(quizId, signal)
    },
    [quizId]
  )
}
