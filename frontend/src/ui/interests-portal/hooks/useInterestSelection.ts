import { useCallback, useRef, useState } from 'react'
import { api } from '../../../api/client'

export function useInterestSelection() {
  const [processing, setProcessing] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const processingRef = useRef<Set<string>>(new Set())
  const pendingSelectionRef = useRef<Map<string, boolean>>(new Map())

  const updateProcessing = useCallback(() => {
    setProcessing(new Set(processingRef.current))
  }, [])

  const applyPendingSelections = useCallback((base: Set<string>) => {
    pendingSelectionRef.current.forEach((desired, id) => {
      if (desired) {
        base.add(id)
      } else {
        base.delete(id)
      }
    })
  }, [])

  const setPending = useCallback((interestId: string, desired: boolean) => {
    pendingSelectionRef.current.set(interestId, desired)
    processingRef.current.add(interestId)
    updateProcessing()
  }, [updateProcessing])

  const clearPending = useCallback((interestId: string) => {
    pendingSelectionRef.current.delete(interestId)
    processingRef.current.delete(interestId)
    updateProcessing()
  }, [updateProcessing])

  const setOptimistic = useCallback((interestId: string, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (selected) {
        next.add(interestId)
      } else {
        next.delete(interestId)
      }
      return next
    })
  }, [])

  const reconcile = useCallback((items: Array<{ id: string; selected: boolean }>) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      items.forEach(item => {
        if (item.selected) {
          next.add(item.id)
        } else {
          next.delete(item.id)
        }
      })
      applyPendingSelections(next)
      return next
    })
  }, [applyPendingSelections])

  const toggle = useCallback(async (interestId: string) => {
    if (processingRef.current.has(interestId)) return null

    const currentlySelected = selectedIds.has(interestId)
    const desiredSelected = !currentlySelected
    setPending(interestId, desiredSelected)
    setOptimistic(interestId, desiredSelected)
    try {
      if (desiredSelected) {
        await api.interests.select(interestId)
      } else {
        await api.interests.deselect(interestId)
      }
      clearPending(interestId)
      return true
    } catch (e) {
      setOptimistic(interestId, currentlySelected)
      clearPending(interestId)
      console.error('Failed to toggle interest:', e)
      throw e
    }
  }, [clearPending, selectedIds, setOptimistic, setPending])

  return {
    toggle,
    reconcile,
    isSelected: (id: string) => selectedIds.has(id),
    isProcessing: (id: string) => processing.has(id),
  }
}
