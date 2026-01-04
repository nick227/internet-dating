import { useCallback, useEffect, useRef, useState } from 'react'
import type { Id, LikeAction } from '../../api/types'

export type StoredReaction = Extract<LikeAction, 'LIKE' | 'DISLIKE'> | null

const STORAGE_KEY = 'internet-date:reactions'
const LEGACY_PASS = 'PASS'

function readReactions(): Record<string, StoredReaction> {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, StoredReaction | string>
    const normalized: Record<string, StoredReaction> = {}
    for (const [key, value] of Object.entries(parsed ?? {})) {
      if (value === LEGACY_PASS) {
        normalized[key] = 'DISLIKE'
      } else if (value === 'LIKE' || value === 'DISLIKE') {
        normalized[key] = value
      }
    }
    return normalized
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
  const writeQueue = useRef<Map<string, StoredReaction>>(new Map())
  const writeTimeoutRef = useRef<number | null>(null)

  const flushWrites = useCallback(() => {
    if (writeQueue.current.size === 0) return
    const map = readReactions()
    for (const [k, v] of writeQueue.current) {
      if (v) {
        map[k] = v
      } else {
        delete map[k]
      }
    }
    writeReactions(map)
    writeQueue.current.clear()
  }, [])

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

      // Queue write
      if (next) {
        writeQueue.current.set(key, next)
      } else {
        writeQueue.current.delete(key)
      }

      // Debounce localStorage writes
      if (writeTimeoutRef.current) {
        clearTimeout(writeTimeoutRef.current)
      }
      writeTimeoutRef.current = window.setTimeout(() => {
        flushWrites()
        writeTimeoutRef.current = null
      }, 300) // Batch writes
    },
    [userId, flushWrites]
  )

  // Always flush queued writes on unmount / visibilitychange to prevent data loss
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (writeTimeoutRef.current) {
          clearTimeout(writeTimeoutRef.current)
          writeTimeoutRef.current = null
        }
        flushWrites()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      // Flush on unmount
      if (writeTimeoutRef.current) {
        clearTimeout(writeTimeoutRef.current)
      }
      flushWrites()
    }
  }, [flushWrites])

  return { reaction, setReaction }
}
