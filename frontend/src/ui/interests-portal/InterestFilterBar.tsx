import type { InterestSubject } from './types'

interface InterestFilterBarProps {
  subjects: InterestSubject[]
  selectedSubjectId: string | null
  onSubjectChange: (subjectId: string | null) => void
}

export function InterestFilterBar({
  subjects,
  selectedSubjectId,
  onSubjectChange,
}: InterestFilterBarProps) {
  return (
    <div className="interest-filter-bar">
      <div className="interest-filter-bar__subjects">
        <button
          type="button"
          className={`interest-filter-bar__subject${selectedSubjectId === null ? ' interest-filter-bar__subject--active' : ''}`}
          onClick={() => onSubjectChange(null)}
        >
          All
        </button>
        {subjects.map(subject => (
          <button
            key={subject.id}
            type="button"
            className={`interest-filter-bar__subject${selectedSubjectId === subject.id ? ' interest-filter-bar__subject--active' : ''}`}
            onClick={() => onSubjectChange(subject.id)}
          >
            {subject.label}
          </button>
        ))}
      </div>
    </div>
  )
}
