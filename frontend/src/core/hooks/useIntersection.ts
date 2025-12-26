import { useCallback, useEffect, useState } from 'react'

export function useIntersection<T extends Element>(options?: IntersectionObserverInit) {
  const [node, setNode] = useState<T | null>(null)
  const [isIntersecting, setIntersecting] = useState(false)

  const ref = useCallback((el: T | null) => {
    setNode(el)
  }, [])

  useEffect(() => {
    if (!node) {
      setIntersecting(false)
      return
    }
    const obs = new IntersectionObserver(([entry]) => setIntersecting(entry.isIntersecting), options)
    obs.observe(node)
    return () => obs.disconnect()
  }, [node, options])

  return { ref, isIntersecting }
}
