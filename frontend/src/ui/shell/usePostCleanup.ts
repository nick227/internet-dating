/**
 * Centralized cleanup management with explicit ordering
 * Prevents double-cleanup and ensures proper execution order
 */
import { useCallback, useEffect, useRef } from 'react'

type CleanupTask = () => void

type CleanupOrder = 'first' | 'normal' | 'last'

export function usePostCleanup() {
  const cleanupTasksRef = useRef<Map<CleanupOrder, Set<CleanupTask>>>(new Map())
  const isCleaningUpRef = useRef(false)

  // Initialize cleanup order buckets
  if (!cleanupTasksRef.current.has('first')) {
    cleanupTasksRef.current.set('first', new Set())
    cleanupTasksRef.current.set('normal', new Set())
    cleanupTasksRef.current.set('last', new Set())
  }

  const register = useCallback((task: CleanupTask, order: CleanupOrder = 'normal') => {
    const bucket = cleanupTasksRef.current.get(order)
    if (bucket) {
      bucket.add(task)
    }
    return () => {
      const bucket = cleanupTasksRef.current.get(order)
      if (bucket) {
        bucket.delete(task)
      }
    }
  }, [])

  const execute = useCallback(() => {
    if (isCleaningUpRef.current) return
    isCleaningUpRef.current = true

    try {
      // Execute in explicit order: first, normal, last
      const order: CleanupOrder[] = ['first', 'normal', 'last']
      for (const bucketName of order) {
        const bucket = cleanupTasksRef.current.get(bucketName)
        if (bucket) {
          bucket.forEach(task => {
            try {
              task()
            } catch (err) {
              console.warn(`[post-cleanup] Cleanup task failed (${bucketName}):`, err)
            }
          })
          bucket.clear()
        }
      }
    } finally {
      isCleaningUpRef.current = false
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      execute()
    }
  }, [execute])

  return { register, execute }
}
