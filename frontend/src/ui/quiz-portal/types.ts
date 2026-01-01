export interface QuizTag {
  slug: string
  label: string
}

export interface Quiz {
  id: string
  slug: string
  title: string
  isActive: boolean
  tags?: QuizTag[]
  createdAt: string
  updatedAt: string
}

export interface QuizListItem extends Quiz {
  description?: string
  status?: 'new' | 'in_progress' | 'completed'
  result?: string // e.g. "The Architect"
  completedAt?: string
  progress?: number // 0-100
  questionCount: number
}

export type QuizFilterType = 'all' | 'new' | 'in_progress' | 'completed'
export type QuizSortType = 'newest' | 'popular' | 'title'
