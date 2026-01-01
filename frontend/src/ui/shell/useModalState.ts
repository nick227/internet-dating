import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type ModalType = 'controlPanel' | 'post' | 'heroMosaicViewer' | 'mediaViewer' | null

type ModalStateValue = {
  openModal: ModalType
  openControlPanel: () => void
  openPost: () => void
  openHeroMosaicViewer: () => void
  openMediaViewer: () => void
  closeModal: () => void
}

const ModalStateContext = createContext<ModalStateValue | null>(null)

export function ModalStateProvider({ children }: { children: ReactNode }) {
  const [openModal, setOpenModal] = useState<ModalType>(null)

  const openControlPanel = useCallback(() => {
    setOpenModal('controlPanel')
  }, [])

  const openPost = useCallback(() => {
    setOpenModal('post')
  }, [])

  const openHeroMosaicViewer = useCallback(() => {
    setOpenModal('heroMosaicViewer')
  }, [])

  const openMediaViewer = useCallback(() => {
    setOpenModal('mediaViewer')
  }, [])

  const closeModal = useCallback(() => {
    setOpenModal(null)
  }, [])

  const value = useMemo(
    () => ({
      openModal,
      openControlPanel,
      openPost,
      openHeroMosaicViewer,
      openMediaViewer,
      closeModal,
    }),
    [openModal, openControlPanel, openPost, openHeroMosaicViewer, openMediaViewer, closeModal]
  )

  return createElement(ModalStateContext.Provider, { value }, children)
}

export function useModalState() {
  const context = useContext(ModalStateContext)
  if (!context) {
    throw new Error('useModalState must be used within ModalStateProvider')
  }
  return context
}
