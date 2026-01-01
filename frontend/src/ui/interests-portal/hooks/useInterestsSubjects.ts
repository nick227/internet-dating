import { useEffect, useState } from 'react'
import { api } from '../../../api/client'
import type { InterestSubject } from '../types'

export function useInterestsSubjects() {
  const [subjects, setSubjects] = useState<InterestSubject[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    api.interests.subjects()
      .then(res => {
        if (!mounted) return
        setSubjects(res.subjects)
      })
      .catch(e => {
        if (!mounted) return
        setError(e instanceof Error ? e.message : 'Failed to load subjects')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  return { subjects, loading, error }
}
