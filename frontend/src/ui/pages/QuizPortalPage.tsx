import { useState } from 'react'
import { useQuizDiscovery } from '../quiz-portal/hooks/useQuizDiscovery'
import { QuizFilterBar } from '../quiz-portal/QuizFilterBar'
import { QuizList } from '../quiz-portal/QuizList'
import { QuizFilterType, QuizSortType } from '../quiz-portal/types'
import { PersonalityPortalFrame } from '../personality-portal/PersonalityPortalFrame'

type QuizPortalPageProps = {
  variant?: 'standalone' | 'embedded'
}

export function QuizPortalPage({ variant = 'standalone' }: QuizPortalPageProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<QuizFilterType>('all')
  const [sort, setSort] = useState<QuizSortType>('newest')
  const [selectedTag, setSelectedTag] = useState<string>('all')
  const isEmbedded = variant === 'embedded'

  const { items, loading, tags } = useQuizDiscovery(searchQuery, filter, sort, selectedTag)

  return (
    <PersonalityPortalFrame variant={variant}>
      <div className="quiz-portal">
        <div className="portal-shell__body">
          <div className={`portal-shell__filters${isEmbedded ? '' : ' portal-shell__filters--sticky'}`}>
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
          </div>
          
        <div className="portal-shell__main quiz-portal__content">
          <QuizList
            items={items}
            loading={loading}
            isFiltered={Boolean(searchQuery) || filter !== 'all' || sort !== 'newest' || selectedTag !== 'all'}
          />
        </div>
      </div>
      </div>
    </PersonalityPortalFrame>
  )
}
