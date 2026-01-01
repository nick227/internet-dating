import { useState, useCallback } from 'react'
import type { HeroMediaItem } from './useHeroItems'

export type HeroMosaicViewState = {
  viewerOpen: boolean
  viewerIndex: number
  pickerOpen: boolean
  pickerTargetId?: string
  pickerSlotIndex?: number
}

export function useHeroMosaicState(items: HeroMediaItem[]) {
  const [viewState, setViewState] = useState<HeroMosaicViewState>({
    viewerOpen: false,
    viewerIndex: 0,
    pickerOpen: false,
  })

  const openViewer = useCallback(
    (index: number) => {
      if (index >= 0 && index < items.length) {
        setViewState({
          viewerOpen: true,
          viewerIndex: index,
          pickerOpen: false,
        })
      }
    },
    [items.length]
  )

  const closeViewer = useCallback(() => {
    setViewState(prev => ({
      ...prev,
      viewerOpen: false,
    }))
  }, [])

  const openPicker = useCallback((targetId?: string, slotIndex?: number) => {
    setViewState({
      viewerOpen: false,
      viewerIndex: 0,
      pickerOpen: true,
      pickerTargetId: targetId,
      pickerSlotIndex: slotIndex,
    })
  }, [])

  const closePicker = useCallback(() => {
    setViewState(prev => ({
      ...prev,
      pickerOpen: false,
      pickerTargetId: undefined,
      pickerSlotIndex: undefined,
    }))
  }, [])

  return {
    viewState,
    openViewer,
    closeViewer,
    openPicker,
    closePicker,
  }
}
