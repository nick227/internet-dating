import { lazy, ReactNode } from 'react'
import { useCurrentUser } from '../../core/auth/useCurrentUser'
import { useRealtime } from '../../core/ws/useRealtime'
import { useSwipeNavigation } from '../../core/gestures/useSwipeNavigation'
import { SWIPE_CONFIG } from './swipeConfig'
import { TopBar } from './TopBar'
import { BottomNav } from './BottomNav'
import { ControlPanelProvider } from './ControlPanelContext'
import { useModalState } from './useModalState'
import { useLogout } from './useLogout'
import { useAppNavigation } from './useAppNavigation'
import { useDebouncedAuthChange } from './useDebouncedAuthChange'
import { ErrorBoundary } from './ErrorBoundary'
import { ModalRenderer } from './ModalRenderer'
import { MediaViewerProvider } from '../ui/MediaViewerContext'

// Lazy load modals - only load when opened (major bundle reduction)
// Modal chunk loading failures are handled by ErrorBoundary in ModalRenderer
// which displays a user-friendly error message with retry option
const UserControlPanel = lazy(() => import('./UserControlPanel').then(m => ({ default: m.UserControlPanel })))
const PostContentModal = lazy(() => import('./PostContentModal').then(m => ({ default: m.PostContentModal })))
const MediaViewer = lazy(() => import('../ui/MediaViewer').then(m => ({ default: m.MediaViewer })))

/**
 * AppShell - Main application container
 *
 * Handles:
 * - Authentication state and user session management
 * - WebSocket realtime connections (auto-connects/disconnects based on auth state)
 * - Swipe navigation gestures
 * - Modal state management (control panel, post composer)
 * - Error boundaries for content and modals
 *
 * Auth Lifecycle:
 * - Initial load: Shows loading state while checking authentication
 * - Authenticated: Renders full UI with modals and navigation
 * - Unauthenticated: Renders UI without modals (expected for logged-out users)
 * - Auth changes: emitAuthChange() triggers session refetch, causing re-render
 *   - Logout: Clears state, disconnects WebSocket, navigates to login
 *   - Token expiry: Session refetch fails, userId becomes null, UI adapts
 *   - Login: Session refetch succeeds, userId populated, modals become available
 *
 * Error Boundaries:
 * - Outer boundary: Catches critical errors in shell structure
 * - Stage boundary: Isolates content errors, keeps navigation available
 * - Modal boundaries: Each modal has its own boundary (in ModalRenderer)
 * - TopBar: No boundary needed (stable component, errors should propagate)
 *
 * Navigation Availability:
 * - Loading state: No BottomNav (user not authenticated yet)
 * - Normal state: BottomNav outside error boundary (remains available if content crashes)
 */
export function AppShell({ children }: { children: ReactNode }) {
  const currentUser = useCurrentUser()
  const { logout } = useLogout()
  const { goToFeed, goToLogin, goToProfile } = useAppNavigation()
  const { openModal, openControlPanel, openPost, closeModal } = useModalState()
  const { triggerAuthChange } = useDebouncedAuthChange()

  const userId = currentUser.userId
  const isLoading = currentUser.loading

  // WebSocket connection: automatically connects/disconnects based on userId
  // Cleanup handled internally via useEffect return function
  useRealtime(userId, isLoading)

  // Swipe navigation: automatically cleans up event listeners on unmount
  // Cleanup handled internally by useSwipeNavigation hook
  useSwipeNavigation({
    enabled: Boolean(userId),
    threshold: SWIPE_CONFIG.threshold,
    velocity: SWIPE_CONFIG.velocity,
  })

  const handleUserClick = () => {
    // Note: This handler is only called from TopBar when user is logged in.
    // However, during loading state, userId may be null, so we guard it.
    // In normal state, TopBar only shows user avatar when isLoggedIn is true.
    // Chrome-specific: Prevent navigation if session is invalid to avoid auth loops
    if (userId && !isLoading) {
      goToProfile(userId)
    }
  }

  // Disable logout during initial load to prevent race conditions
  // useLogout has async operations that could conflict with auth initialization
  const handleLogout = isLoading ? () => {
    // No-op: logout disabled during initial auth check
  } : logout

  // Shared stage content wrapper with error boundary
  // This boundary isolates content errors while keeping navigation available
  const stageContent = (
    <ErrorBoundary>
      <div className="stage">
        {!isLoading && userId && (
          <ModalRenderer
            modalType="post"
            openModal={openModal}
            component={PostContentModal}
            props={{
              onClose: closeModal,
              onPosted: triggerAuthChange,
            }}
          />
        )}
        {children}
        {isLoading && (
          <div
            className="u-loading-overlay"
            role="progressbar"
            aria-busy="true"
            aria-label="Loading application"
          >
            <div className="u-muted">Loading...</div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  )

  return (
    <ErrorBoundary>
      <ControlPanelProvider openControlPanel={openControlPanel}>
        <MediaViewerProvider>
            <div className="shell">
            <TopBar
              title="Internet Dating"
              user={{
                displayName: isLoading ? null : currentUser.displayName,
                avatarUrl: isLoading ? null : currentUser.profile?.avatarUrl,
                userId: isLoading ? null : userId,
                isLoggedIn: !isLoading && Boolean(userId),
                loading: isLoading,
              }}
              onHome={goToFeed}
              onLogin={() => goToLogin('login')}
              onSignup={() => goToLogin('signup')}
              onLogout={handleLogout}
              onUserClick={handleUserClick}
            />
            {!isLoading && userId && (
              <>
                <ModalRenderer
                  modalType="controlPanel"
                  openModal={openModal}
                  component={UserControlPanel}
                  props={{
                    userId,
                    profile: currentUser.profile,
                    onClose: closeModal,
                    onUpdated: triggerAuthChange,
                  }}
                />
              </>
            )}
            {stageContent}
            {!isLoading && userId && (
              <BottomNav
                onPostClick={openPost}
              />
            )}
            {!isLoading && userId && (
              <ModalRenderer
                modalType="mediaViewer"
                openModal={openModal}
                component={MediaViewer}
                props={{
                  onClose: closeModal,
                }}
              />
            )}
          </div>
        </MediaViewerProvider>
      </ControlPanelProvider>
    </ErrorBoundary>
  )
}
