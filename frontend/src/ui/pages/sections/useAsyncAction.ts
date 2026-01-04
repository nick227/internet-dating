import { useCallback, useState } from 'react'
import { getErrorMessage } from '../../../core/utils/errors'

type RunActionOptions = {
  key: string
  action: () => Promise<void>
  errorMessage: string
  onSuccess?: () => void
}

export function useAsyncAction() {
  const [processing, setProcessing] = useState<Record<string, boolean>>({})
  const [actionError, setActionError] = useState<string | null>(null)

  const claim = useCallback((key: string) => {
    let claimed = false
    setProcessing(prev => {
      if (prev[key]) return prev
      claimed = true
      return { ...prev, [key]: true }
    })
    return claimed
  }, [])

  const release = useCallback((key: string) => {
    setProcessing(prev => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const clearActionError = useCallback(() => {
    setActionError(null)
  }, [])

  const runAction = useCallback(
    async ({ key, action, errorMessage, onSuccess }: RunActionOptions) => {
      if (!claim(key)) return
      setActionError(null)
      try {
        await action()
        setActionError(null)
        onSuccess?.()
      } catch (err) {
        setActionError(getErrorMessage(err, errorMessage))
      } finally {
        release(key)
      }
    },
    [claim, release]
  )

  return { processing, actionError, runAction, clearActionError }
}
