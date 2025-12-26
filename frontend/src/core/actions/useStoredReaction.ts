import { useCallback, useEffect, useState } from 'react'
import type { Id, SwipeAction } from '../../api/types'

export type StoredReaction = SwipeAction | null

const STORAGE_KEY = 'internet-date:reactions'

function readReactions(): Record<string, StoredReaction> {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, StoredReaction>
    return parsed ?? {}
  } catch {
    return {}
  }
}

function writeReactions(map: Record<string, StoredReaction>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function useStoredReaction(userId: Id | undefined) {
  const [reaction, setReactionState] = useState<StoredReaction>(null)

  useEffect(() => {
    if (!userId) {
      setReactionState(null)
      return
    }
    const key = String(userId)
    const map = readReactions()
    setReactionState(map[key] ?? null)
  }, [userId])

  const setReaction = useCallback(
    (next: StoredReaction) => {
      if (!userId) return
      const key = String(userId)
      setReactionState(next)
      const map = readReactions()
      if (next) {
        map[key] = next
      } else {
        delete map[key]
      }
      writeReactions(map)
    },
    [userId]
  )

  return { reaction, setReaction }
}
