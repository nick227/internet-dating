import { Component, type ReactNode } from 'react'
import type { FeedCard } from '../../api/types'

type Props = {
  card: FeedCard
  children: ReactNode
  fallback?: ReactNode
}

type State = {
  hasError: boolean
  error?: Error
}

export class RiverCardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error for monitoring
    console.error('[RiverCardErrorBoundary] Card rendering error:', {
      cardId: this.props.card.id,
      cardKind: this.props.card.kind,
      error,
      errorInfo,
    })
  }

  componentDidUpdate(prevProps: Props) {
    // Reset error state if card changes
    if (prevProps.card.id !== this.props.card.id) {
      this.setState({ hasError: false, error: undefined })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="riverCard riverCard--error">
            <div className="u-pad-4">
              <p className="u-muted">Unable to display this card.</p>
              <button
                type="button"
                className="actionBtn u-mt-2"
                onClick={() => this.setState({ hasError: false, error: undefined })}
              >
                Try again
              </button>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}
