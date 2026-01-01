import { Component, ReactNode, ErrorInfo } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
  fallback?: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const DEBUG = Boolean(import.meta.env?.DEV)
    if (DEBUG) {
      console.error('[ErrorBoundary] Caught error:', error, errorInfo)
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="modal" role="alert">
          <div className="modal__backdrop" />
          <div className="modal__panel">
            <div className="modal__body" style={{ padding: 'var(--s-6)' }}>
              <div className="u-title">Something went wrong</div>
              <div className="u-muted u-mt-2">
                {this.state.error?.message ?? 'An unexpected error occurred'}
              </div>
              <button
                className="topBar__btn u-mt-4"
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
