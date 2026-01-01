import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react'

type MediaItem = {
  src: string
  alt?: string
  type?: 'image' | 'video' | 'audio'
  poster?: string
}

type MediaViewerState = {
  items: MediaItem[]
  initialIndex: number
}

type MediaViewerContextValue = {
  viewerState: MediaViewerState | null
  openViewer: (items: MediaItem[], initialIndex?: number) => void
  closeViewer: () => void
}

const MediaViewerContext = createContext<MediaViewerContextValue | null>(null)

export function MediaViewerProvider({ children }: { children: ReactNode }) {
  const [viewerState, setViewerState] = useState<MediaViewerState | null>(null)

  const openViewer = useCallback((items: MediaItem[], initialIndex = 0) => {
    if (items.length === 0) return
    setViewerState({
      items,
      initialIndex: Math.max(0, Math.min(initialIndex, items.length - 1)),
    })
  }, [])

  const closeViewer = useCallback(() => {
    setViewerState(null)
  }, [])

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({ viewerState, openViewer, closeViewer }),
    [viewerState, openViewer, closeViewer]
  )

  return <MediaViewerContext.Provider value={contextValue}>{children}</MediaViewerContext.Provider>
}

export function useMediaViewer() {
  const context = useContext(MediaViewerContext)
  if (!context) {
    throw new Error('useMediaViewer must be used within MediaViewerProvider')
  }
  return context
}
