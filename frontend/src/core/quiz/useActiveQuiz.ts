import { api } from '../../api/client'
import { useAsync } from '../hooks/useAsync'

export function useActiveQuiz() {
  return useAsync(signal => api.quizzes.active(signal), [])
}
