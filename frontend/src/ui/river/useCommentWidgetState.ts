import { useCallback, useState } from 'react'

/**
 * Hook for managing comment widget visual state (separate from data state)
 * SRP: Manages open level, animation phase, and visual transitions
 */
export type CommentWidgetLevel = 'closed' | 'peek' | 'expanded' | 'full'

export function useCommentWidgetState(initialOpen: boolean) {
  const [level, setLevel] = useState<CommentWidgetLevel>(initialOpen ? 'full' : 'closed')
  const [isAnimating, setIsAnimating] = useState(false)

  const open = useCallback((targetLevel: CommentWidgetLevel = 'full') => {
    setIsAnimating(true)
    setLevel(targetLevel)
    // Animation completes after transition
    setTimeout(() => setIsAnimating(false), 300)
  }, [])

  const close = useCallback(() => {
    setIsAnimating(true)
    setLevel('closed')
    setTimeout(() => setIsAnimating(false), 300)
  }, [])

  const expand = useCallback(() => {
    if (level === 'peek') {
      setIsAnimating(true)
      setLevel('expanded')
      setTimeout(() => setIsAnimating(false), 300)
    } else if (level === 'expanded') {
      setIsAnimating(true)
      setLevel('full')
      setTimeout(() => setIsAnimating(false), 300)
    }
  }, [level])

  const collapse = useCallback(() => {
    if (level === 'full') {
      setIsAnimating(true)
      setLevel('expanded')
      setTimeout(() => setIsAnimating(false), 300)
    } else if (level === 'expanded') {
      setIsAnimating(true)
      setLevel('peek')
      setTimeout(() => setIsAnimating(false), 300)
    } else if (level === 'peek') {
      close()
    }
  }, [level, close])

  return {
    level,
    isAnimating,
    open,
    close,
    expand,
    collapse,
    isOpen: level !== 'closed',
  }
}
