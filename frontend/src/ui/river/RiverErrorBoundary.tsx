import { Component, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  fallback?: ReactNode
}

type State = {
  hasError: boolean
  error?: Error
}

export class RiverErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error for monitoring
    console.error('[RiverErrorBoundary] Feed rendering error:', {
      error,
      errorInfo,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="river u-hide-scroll">
            <div className="river__pad">
              <div className="u-glass u-pad-4 river__panel">
                <div className="river__panelTitle">Feed error</div>
                <div className="u-muted u-mt-2 river__panelText">
                  Something went wrong loading the feed.
                </div>
                <button
                  type="button"
                  className="actionBtn u-mt-4"
                  onClick={() => {
                    this.setState({ hasError: false, error: undefined })
                    window.location.reload()
                  }}
                >
                  Reload page
                </button>
              </div>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}
