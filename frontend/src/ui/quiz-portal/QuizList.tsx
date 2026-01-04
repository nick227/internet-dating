import { PortalList } from '../personality-portal/PortalList'
import { QuizCard } from './QuizCard'
import { QuizListItem } from './types'

interface QuizListProps {
  items: QuizListItem[]
  loading: boolean
  isFiltered?: boolean
}

export function QuizList({ items, loading, isFiltered = false }: QuizListProps) {
  return (
    <PortalList
      items={items}
      loading={loading}
      isFiltered={isFiltered}
      empty={{ idle: 'No quizzes found.', filtered: 'No quizzes match your filters.' }}
      renderItem={quiz => <QuizCard key={quiz.id} quiz={quiz} />}
    />
  )
}
