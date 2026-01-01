import { useCallback, useState } from 'react'
import { api, type InterestItem } from '../../../api/client'

export function useInterestSelection() {
  const [processing, setProcessing] = useState<Set<string>>(new Set())

  const selectInterest = useCallback(async (interestId: string): Promise<InterestItem | null> => {
    if (processing.has(interestId)) return null

    setProcessing(prev => new Set(prev).add(interestId))
    try {
      const result = await api.interests.select(interestId)
      return result
    } catch (e) {
      console.error('Failed to select interest:', e)
      throw e
    } finally {
      setProcessing(prev => {
        const next = new Set(prev)
        next.delete(interestId)
        return next
      })
    }
  }, [processing])

  const deselectInterest = useCallback(async (interestId: string): Promise<boolean> => {
    if (processing.has(interestId)) return false

    setProcessing(prev => new Set(prev).add(interestId))
    try {
      await api.interests.deselect(interestId)
      return true
    } catch (e) {
      console.error('Failed to deselect interest:', e)
      throw e
    } finally {
      setProcessing(prev => {
        const next = new Set(prev)
        next.delete(interestId)
        return next
      })
    }
  }, [processing])

  return {
    selectInterest,
    deselectInterest,
    isProcessing: (id: string) => processing.has(id),
  }
}
