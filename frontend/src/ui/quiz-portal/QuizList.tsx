import { QuizCard } from './QuizCard'
import { QuizListItem } from './types'

interface QuizListProps {
  items: QuizListItem[]
  loading: boolean
}

export function QuizList({ items, loading }: QuizListProps) {
  if (loading && items.length === 0) {
    return (
      <div className="quiz-list-empty">
        Loading quizzes...
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="quiz-list-empty">
        No quizzes found.
      </div>
    )
  }

  return (
    <div className="quiz-list">
      {items.map(quiz => (
        <QuizCard key={quiz.id} quiz={quiz} />
      ))}
    </div>
  )
}
