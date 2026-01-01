import { useEffect, useState } from 'react'
import { api } from '../../../api/client'
import { QuizFilterType, QuizListItem, QuizSortType } from '../types'

// Mock data generator for development
const generateMockQuizzes = (): QuizListItem[] => {
  return Array.from({ length: 10 }).map((_, i) => ({
    id: `mock-${i}`,
    slug: `mock-quiz-${i}`,
    title: `Personality Quiz #${i + 1}: ${['The Vibe', 'Love Language', 'Attachment Style'][i % 3]}`,
    description: 'Discover your true self with this scientifically backed assessment.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questions: [], // Detail view would load these
    questionCount: 10,
    status: i === 0 ? 'in_progress' : i < 3 ? 'completed' : 'new',
    progress: i === 0 ? 40 : i < 3 ? 100 : 0,
    result: i < 3 ? 'The Architect' : undefined,
    completedAt: i < 3 ? new Date().toISOString() : undefined,
    tags: [{ slug: 'personality', label: 'Personality' }]
  }))
}

export function useQuizDiscovery(
  searchQuery: string,
  filter: QuizFilterType,
  sort: QuizSortType,
  tag: string // Added tag param
) {
  const [items, setItems] = useState<QuizListItem[]>([])
  const [tags, setTags] = useState<{ label: string; value: string }[]>([]) // Added tags state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    const fetchQuizzes = async () => {
      try {
        // Fetch tags if not loaded
        if (tags.length === 0) {
             try {
                const tagRes = await api.quizzes.tags()
                setTags(tagRes.tags.map((t: any) => ({ label: t.label, value: t.slug })))
             } catch (err) {
                 console.warn('Failed to assign tags', err)
             }
        }

        const res = await api.quizzes.list({ q: searchQuery, status: filter, sort, tag })
        if (!mounted) return
        
        let data = (res.items || []) as QuizListItem[]

        // Fallback to mock if API returns empty
        if (data.length === 0 && import.meta.env?.DEV) {
           // console.debug('Using mock quizzes')
           // data = generateMockQuizzes() 
        }

        setItems(data)
      } catch (e) {
        if (!mounted) return
        console.warn('Failed to load quizzes from API, falling back to mock', e)
        setItems(generateMockQuizzes())
      } finally {
        if (mounted) setLoading(false)
      }
    }

    const timer = setTimeout(fetchQuizzes, 300) // Debounce simulation
    return () => {
      mounted = false
      clearTimeout(timer)
    }
  }, [searchQuery, filter, sort, tag])

  return { items, loading, error, tags } // Return tags
}
