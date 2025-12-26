import { useEffect, useRef, useState } from 'react'

type AsyncFn<T> = (signal: AbortSignal) => Promise<T>

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) return error.name === 'AbortError'
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && (error as { name?: unknown }).name === 'AbortError'
}

export function useAsync<T>(fn: AsyncFn<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const ctrlRef = useRef<AbortController | null>(null)

  useEffect(() => {
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl

    setLoading(true)
    setError(null)

    fn(ctrl.signal)
      .then(setData)
      .catch((e: unknown) => {
        if (isAbortError(e)) return
        setError(e)
      })
      .finally(() => setLoading(false))

    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading }
}
