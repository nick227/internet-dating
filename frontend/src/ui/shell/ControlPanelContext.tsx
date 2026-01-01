import { createContext, useContext, ReactNode } from 'react'

type ControlPanelContextValue = {
  openControlPanel: () => void
}

const ControlPanelContext = createContext<ControlPanelContextValue | null>(null)

export function ControlPanelProvider({
  children,
  openControlPanel,
}: {
  children: ReactNode
  openControlPanel: () => void
}) {
  return (
    <ControlPanelContext.Provider value={{ openControlPanel }}>
      {children}
    </ControlPanelContext.Provider>
  )
}

export function useControlPanel() {
  const context = useContext(ControlPanelContext)
  if (!context) {
    throw new Error('useControlPanel must be used within ControlPanelProvider')
  }
  return context
}
