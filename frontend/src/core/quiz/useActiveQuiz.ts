import { api, type ApiQuizResponse } from '../../api/client'
import { useAsync } from '../hooks/useAsync'

export function useActiveQuiz(enabled = true) {
  return useAsync<ApiQuizResponse>(
    signal => {
      if (!enabled) {
        return Promise.resolve({ quiz: null })
      }
      return api.quizzes.active(signal)
    },
    [enabled]
  )
}
