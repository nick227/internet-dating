import { useEffect, useMemo, useRef, useState } from 'react'

type AsyncFn<T> = (signal: AbortSignal) => Promise<T>

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) return error.name === 'AbortError'
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

// Create a stable key from dependency array for React's dependency comparison
function depsKey(deps: unknown[]): string {
  return deps
    .map(d => {
      if (d === null) return 'null'
      if (d === undefined) return 'undefined'
      if (typeof d === 'object') return JSON.stringify(d)
      return String(d)
    })
    .join('|')
}

export function useAsync<T>(fn: AsyncFn<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const ctrlRef = useRef<AbortController | null>(null)
  const fnRef = useRef(fn)
  const isMountedRef = useRef(true)

  // Keep fnRef.current in sync with fn
  fnRef.current = fn

  // Create stable key from deps for React's dependency array
  const depsKeyValue = useMemo(() => depsKey(deps), [deps])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl

    setLoading(true)
    setError(null)
    // Don't reset data - preserve it during loading to prevent flickering
    // This is especially important for session data to prevent auth redirects

    // Use fnRef.current to ensure we always call the latest function
    fnRef
      .current(ctrl.signal)
      .then(result => {
        if (isMountedRef.current && !ctrl.signal.aborted) {
          setData(result)
          setError(null) // Clear error on success
        }
      })
      .catch((e: unknown) => {
        if (isAbortError(e)) return
        if (isMountedRef.current && !ctrl.signal.aborted) {
          setError(e)
          // Don't clear data on error - preserve previous data to prevent flickering
          // This prevents auth redirects when API calls fail
        }
      })
      .finally(() => {
        if (isMountedRef.current && !ctrl.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      ctrl.abort()
    }
  }, [depsKeyValue]) // Use stable key instead of deps array

  return { data, error, loading }
}
