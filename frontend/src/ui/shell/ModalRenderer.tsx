import { Suspense, ReactNode, LazyExoticComponent, ComponentType, createElement } from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import { ModalLoader } from './ModalLoader'

type ModalRendererProps<TProps extends { open: boolean }> = {
  modalType: string
  openModal: string | null
  component: LazyExoticComponent<ComponentType<TProps>>
  fallback?: ReactNode
  props: Omit<TProps, 'open'>
}

/**
 * Conditionally renders a lazy-loaded modal component with error boundary.
 * Only renders when openModal matches modalType, ensuring efficient lazy loading.
 * The modal's internal 'open' prop is derived from the match condition.
 * Lazy loading failures are caught by the ErrorBoundary and displayed to the user.
 */
export function ModalRenderer<TProps extends { open: boolean }>({
  modalType,
  openModal,
  component: Component,
  fallback,
  props,
}: ModalRendererProps<TProps>) {
  // Conditional rendering: only render when this modal should be open
  // This ensures lazy-loaded chunks are only fetched when needed
  const shouldRender = openModal === modalType
  
  if (!shouldRender) {
    return null
  }

  // Derive open prop from the match condition (single source of truth)
  const open = true
  const componentProps = { ...props, open } as TProps

  return (
    <ErrorBoundary
      fallback={
        <div className="modal" role="alert">
          <div className="modal__backdrop" />
          <div className="modal__panel">
            <div className="modal__body u-pad-6">
              <div className="u-title">Failed to load</div>
              <div className="u-muted u-mt-2">
                Unable to load this feature. Please check your connection and try again.
              </div>
              <button
                className="topBar__btn u-mt-4"
                type="button"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      }
    >
      <Suspense fallback={fallback ?? <ModalLoader />}>
        {createElement(Component as unknown as ComponentType<TProps>, componentProps)}
      </Suspense>
    </ErrorBoundary>
  )
}
