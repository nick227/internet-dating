import { lazy, Suspense, ReactNode, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useCurrentUser } from '../../core/auth/useCurrentUser'
import { emitAuthChange } from '../../core/auth/authEvents'
import { abortRefresh } from '../../api/authRefresh'
import { useRealtime } from '../../core/ws/useRealtime'
import { useSwipeNavigation } from '../../core/gestures/useSwipeNavigation'
import { TopBar } from './TopBar'
import { BottomNav } from './BottomNav'

// Lazy load modals - only load when opened (major bundle reduction)
const UserControlPanel = lazy(() => import('./UserControlPanel').then(m => ({ default: m.UserControlPanel })))
const PostContentModal = lazy(() => import('./PostContentModal').then(m => ({ default: m.PostContentModal })))
const FollowersModal = lazy(() => import('../profile/FollowersModal').then(m => ({ default: m.FollowersModal })))

export function AppShell({ children }: { children: ReactNode }) {
  console.log('[DEBUG] AppShell: Component rendering')
  const currentUser = useCurrentUser()
  console.log('[DEBUG] AppShell: currentUser', { userId: currentUser.userId, loading: currentUser.loading })
  const nav = useNavigate()
  const userId = currentUser.userId
  const displayName = currentUser.displayName
  console.log('[DEBUG] AppShell: Extracted values', { userId, displayName })
  const [controlPanelOpen, setControlPanelOpen] = useState(false)
  const [postModalOpen, setPostModalOpen] = useState(false)
  const [followersModalOpen, setFollowersModalOpen] = useState(false)
  useRealtime(userId, currentUser.loading)

  // Centralized swipe navigation handling
  useSwipeNavigation({
    enabled: Boolean(userId), // Only enable when logged in
    threshold: 50,
    velocity: 0.3,
  })

  async function handleLogout() {
    try {
      // Cancel any in-progress refresh attempts
      abortRefresh()
      await api.auth.logout()
    } finally {
      // Clear auth state before redirect
      // This ensures WebSockets, caches, and event emitters are cleaned up
      emitAuthChange()

      // Clear localStorage data
      try {
        localStorage.removeItem('internet-date:reactions')
        localStorage.removeItem('river.quiz.answers')
      } catch {
        // Ignore storage errors
      }

      // Small delay to let state clear synchronously
      setTimeout(() => {
        window.location.assign('/login')
      }, 50)
    }
  }

  return (
    <div className="shell">
      <TopBar
        title="Internet Dating"
        displayName={displayName}
        avatarUrl={currentUser.profile?.avatarUrl ?? null}
        isLoggedIn={Boolean(userId)}
        loading={currentUser.loading}
        onHome={() => nav('/feed')}
        onLogin={() => nav('/login?mode=login')}
        onSignup={() => nav('/login?mode=signup')}
        onLogout={handleLogout}
        onUserClick={() => setControlPanelOpen(true)}
      />
      {userId && (
        <>
          {controlPanelOpen && (
            <Suspense fallback={null}>
              <UserControlPanel
                open={controlPanelOpen}
                userId={userId}
                profile={currentUser.profile}
                onClose={() => setControlPanelOpen(false)}
                onUpdated={() => {
                  // Trigger profile refetch by emitting auth change
                  emitAuthChange()
                }}
              />
            </Suspense>
          )}
          {postModalOpen && (
            <Suspense fallback={null}>
              <PostContentModal
                open={postModalOpen}
                onClose={() => setPostModalOpen(false)}
                onPosted={() => {
                  // Refresh feed or trigger update
                  emitAuthChange()
                }}
              />
            </Suspense>
          )}
          {followersModalOpen && (
            <Suspense fallback={null}>
              <FollowersModal
                open={followersModalOpen}
                userId={String(userId)}
                onClose={() => setFollowersModalOpen(false)}
              />
            </Suspense>
          )}
        </>
      )}
      <div className="stage">
        {children}
        {userId && (
          <BottomNav
            onPostClick={() => setPostModalOpen(true)}
            onFollowersClick={() => setFollowersModalOpen(true)}
          />
        )}
      </div>
    </div>
  )
}
