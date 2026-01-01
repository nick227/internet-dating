import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import type { HeroMediaItem } from '../../core/profile/useHeroItems'

type HeroMosaicViewerState = {
  items: HeroMediaItem[]
  initialIndex: number
  isOwner: boolean
  onRemove?: (itemId: string) => void
  onChange?: (itemId: string) => void
}

type HeroMosaicViewerContextValue = {
  viewerState: HeroMosaicViewerState | null
  openViewer: (items: HeroMediaItem[], initialIndex: number, isOwner: boolean, onRemove?: (itemId: string) => void, onChange?: (itemId: string) => void) => void
  closeViewer: () => void
}

const HeroMosaicViewerContext = createContext<HeroMosaicViewerContextValue | null>(null)

export function HeroMosaicViewerProvider({ children }: { children: ReactNode }) {
  const [viewerState, setViewerState] = useState<HeroMosaicViewerState | null>(null)

  const openViewer = useCallback(
    (items: HeroMediaItem[], initialIndex: number, isOwner: boolean, onRemove?: (itemId: string) => void, onChange?: (itemId: string) => void) => {
      setViewerState({ items, initialIndex, isOwner, onRemove, onChange })
    },
    []
  )

  const closeViewer = useCallback(() => {
    setViewerState(null)
  }, [])

  return (
    <HeroMosaicViewerContext.Provider value={{ viewerState, openViewer, closeViewer }}>
      {children}
    </HeroMosaicViewerContext.Provider>
  )
}

export function useHeroMosaicViewer() {
  const context = useContext(HeroMosaicViewerContext)
  if (!context) {
    throw new Error('useHeroMosaicViewer must be used within HeroMosaicViewerProvider')
  }
  return context
}
