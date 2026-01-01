import { useState, useCallback } from 'react'
import type { HeroMediaItem } from './useHeroItems'

type HeroMosaicViewerState = {
  items: HeroMediaItem[]
  initialIndex: number
  isOwner: boolean
  onRemove?: (itemId: string) => void
  onChange?: (itemId: string) => void
}

let viewerState: HeroMosaicViewerState | null = null

export function useHeroMosaicViewerState() {
  const [state, setState] = useState<HeroMosaicViewerState | null>(null)

  if (state) {
    viewerState = state
  }

  const openViewer = useCallback(
    (items: HeroMediaItem[], initialIndex: number, isOwner: boolean, onRemove?: (itemId: string) => void, onChange?: (itemId: string) => void) => {
      setState({ items, initialIndex, isOwner, onRemove, onChange })
    },
    []
  )

  const closeViewer = useCallback(() => {
    setState(null)
  }, [])

  return {
    viewerState: state,
    openViewer,
    closeViewer,
  }
}

export function getViewerState(): HeroMosaicViewerState | null {
  return viewerState
}
