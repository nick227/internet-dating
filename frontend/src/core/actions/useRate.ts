import { useState } from 'react'
import { api } from '../../api/client'
import type { Id } from '../../api/types'

export function useRate(userId: Id) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(body: { attractive: number; smart: number; funny: number; interesting: number }) {
    setLoading(true)
    setError(null)
    try {
      return await api.rate(userId, body)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed'
      setError(message)
      throw e
    } finally {
      setLoading(false)
    }
  }

  return { submit, loading, error }
}
