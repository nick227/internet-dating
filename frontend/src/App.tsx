import { lazy, Suspense } from 'react'
import { Navigate, Route } from 'react-router-dom'
import { AppShell } from './ui/shell/AppShell'
import { ModalStateProvider } from './ui/shell/useModalState'
import { ProtectedRoute } from './core/routing/ProtectedRoute'
import { PublicRoute } from './core/routing/PublicRoute'
import { PageTransition } from './core/routing/PageTransition'

// Eager load FeedPage (initial route) - no lazy loading for fastest first paint
import { FeedPage } from './ui/pages/FeedPage'
// Debug page for testing
import { PageLoadDebug } from './debug/PageLoadDebug'

const DEBUG = Boolean(import.meta.env?.DEV)

// Lazy load all other routes - major bundle size reduction
const ProfilePage = lazy(() => import('./ui/pages/ProfilePage').then(m => ({ default: m.ProfilePage })))
const InboxPage = lazy(() => import('./ui/pages/InboxPage').then(m => ({ default: m.InboxPage })))
const ConversationPage = lazy(() => import('./ui/pages/ConversationPage').then(m => ({ default: m.ConversationPage })))
const QuizPage = lazy(() => import('./ui/pages/QuizPage').then(m => ({ default: m.QuizPage })))
const QuizPortalPage = lazy(() => import('./ui/pages/QuizPortalPage').then(m => ({ default: m.QuizPortalPage })))
const InterestsPortalPage = lazy(() => import('./ui/pages/InterestsPortalPage').then(m => ({ default: m.InterestsPortalPage })))
const AuthPage = lazy(() => import('./ui/pages/AuthPage').then(m => ({ default: m.AuthPage })))
const MatchesPage = lazy(() => import('./ui/pages/MatchesPage').then(m => ({ default: m.MatchesPage })))
const FollowersPage = lazy(() => import('./ui/pages/FollowersPage').then(m => ({ default: m.FollowersPage })))

// Minimal loading fallback for route transitions
function RouteLoader() {
  return null // Routes handle their own loading states
}

export default function App() {
  if (DEBUG) {
    console.log('[DEBUG] App: Component rendering', { pathname: window.location.pathname, timestamp: Date.now() })
  }
  
  return (
    <ModalStateProvider>
      <AppShell>
        <PageTransition>
          <Route path="/" element={<Navigate to="/feed" replace />} />
          <Route
            path="/feed"
            element={
              <ProtectedRoute>
                <FeedPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Suspense fallback={<RouteLoader />}>
                  <AuthPage />
                </Suspense>
              </PublicRoute>
            }
          />
          <Route
            path="/debug"
            element={<PageLoadDebug />}
          />
          <Route
            path="/profiles/:userId"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoader />}>
                  <ProfilePage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/matches"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoader />}>
                  <MatchesPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/followers"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoader />}>
                  <FollowersPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inbox"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoader />}>
                  <InboxPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inbox/:conversationId"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoader />}>
                  <ConversationPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/quiz"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoader />}>
                  <QuizPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/quizzes"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoader />}>
                   <QuizPortalPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/interests"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoader />}>
                  <InterestsPortalPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/feed" replace />} />
        </PageTransition>
      </AppShell>
    </ModalStateProvider>
  )
}
