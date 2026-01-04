import { useParams } from 'react-router-dom'
import { QuizPage } from './QuizPage'

export function QuizDetailPage() {
  const { quizId } = useParams()
  return <QuizPage quizId={quizId} />
}
