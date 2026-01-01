import { useState } from 'react'
import { useQuizDiscovery } from '../quiz-portal/hooks/useQuizDiscovery'
import { QuizFilterBar } from '../quiz-portal/QuizFilterBar'
import { QuizList } from '../quiz-portal/QuizList'
import { QuizFilterType, QuizSortType } from '../quiz-portal/types'

export function QuizPortalPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<QuizFilterType>('all')
  const [sort, setSort] = useState<QuizSortType>('newest')
  const [selectedTag, setSelectedTag] = useState<string>('all')

  const { items, loading, tags } = useQuizDiscovery(searchQuery, filter, sort, selectedTag)

  return (
    <div className="quiz-portal">
      <QuizFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filter={filter}
        onFilterChange={setFilter}
        sort={sort}
        onSortChange={setSort}
        tags={tags}
        selectedTag={selectedTag}
        onTagChange={setSelectedTag}
      />
      
      <div className="quiz-portal__content">
        <QuizList items={items} loading={loading} />
      </div>
    </div>
  )
}
