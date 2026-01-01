import { QuizFilterType, QuizSortType } from './types'

// ... imports

interface QuizFilterBarProps {
  searchQuery: string
  onSearchChange: (val: string) => void
  filter: QuizFilterType
  onFilterChange: (val: QuizFilterType) => void
  sort: QuizSortType
  onSortChange: (val: QuizSortType) => void
  tags?: { label: string; value: string }[]
  selectedTag?: string
  onTagChange?: (tag: string) => void
}

export function QuizFilterBar({
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
  tags = [],
  selectedTag = 'all',
  onTagChange,
}: QuizFilterBarProps) {
  const filters: { label: string; value: QuizFilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'New', value: 'new' },
    { label: 'In Progress', value: 'in_progress' },
    { label: 'History', value: 'completed' },
  ]

  return (

    <div className="quiz-filter-bar">
      <div className="quiz-filter-bar__row">
        <input
          type="text"
          className="quiz-filter-bar__input"
          placeholder="Search quizzes..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>
      
      <div className="quiz-filter-bar__tags">
        <button
           type="button"
           className={`quiz-chip${selectedTag === 'all' ? ' quiz-chip--active' : ''}`}
           onClick={() => onTagChange?.('all')}
        >
          All
        </button>
        {tags.map(t => (
          <button
            key={t.value}
            type="button"
            className={`quiz-chip${selectedTag === t.value ? ' quiz-chip--active' : ''}`}
            onClick={() => onTagChange?.(t.value)}
          >
            {t.label}
          </button>
        ))}
        <div className="quiz-divider" />
        {filters.map(f => (
          <button
            key={f.value}
            type="button"
            className={`quiz-chip${filter === f.value ? ' quiz-chip--active' : ''}`}
            onClick={() => onFilterChange(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}
