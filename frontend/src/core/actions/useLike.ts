import { useState } from 'react'
import { api } from '../../api/client'
import type { Id, LikeAction } from '../../api/types'

export function useLike() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(toUserId: Id, action: LikeAction) {
    setLoading(true)
    setError(null)
    try {
      return await api.like({ toUserId, action })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed'
      setError(message)
      throw e
    } finally {
      setLoading(false)
    }
  }

  return { send, loading, error }
}
