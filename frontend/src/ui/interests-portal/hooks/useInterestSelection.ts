import { useCallback, useRef, useState } from 'react'
import { api, type InterestItem } from '../../../api/client'

export function useInterestSelection() {
  const [processing, setProcessing] = useState<Set<string>>(new Set())
  const processingRef = useRef<Set<string>>(new Set())

  const selectInterest = useCallback(async (interestId: string): Promise<InterestItem | null> => {
    if (processingRef.current.has(interestId)) return null

    processingRef.current.add(interestId)
    setProcessing(new Set(processingRef.current))
    try {
      const result = await api.interests.select(interestId)
      return result
    } catch (e) {
      console.error('Failed to select interest:', e)
      throw e
    } finally {
      processingRef.current.delete(interestId)
      setProcessing(new Set(processingRef.current))
    }
  }, [])

  const deselectInterest = useCallback(async (interestId: string): Promise<boolean> => {
    if (processingRef.current.has(interestId)) return false

    processingRef.current.add(interestId)
    setProcessing(new Set(processingRef.current))
    try {
      await api.interests.deselect(interestId)
      return true
    } catch (e) {
      console.error('Failed to deselect interest:', e)
      throw e
    } finally {
      processingRef.current.delete(interestId)
      setProcessing(new Set(processingRef.current))
    }
  }, [])

  return {
    selectInterest,
    deselectInterest,
    isProcessing: (id: string) => processing.has(id),
  }
}
