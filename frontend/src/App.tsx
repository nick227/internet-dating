import { lazy, Suspense } from 'react'
import { Navigate, Route, useParams } from 'react-router-dom'
import { AppShell } from './ui/shell/AppShell'
import { ModalStateProvider } from './ui/shell/useModalState'
import { SessionProvider } from './core/auth/SessionProvider'
import { ProtectedRoute } from './core/routing/ProtectedRoute'
import { PublicRoute } from './core/routing/PublicRoute'
import { AdminRoute } from './core/routing/AdminRoute'
import { PageTransition } from './core/routing/PageTransition'

// Eager load FeedPage (initial route) - no lazy loading for fastest first paint
import { FeedPage } from './ui/pages/FeedPage'
// Debug page for testing
import { PageLoadDebug } from './debug/PageLoadDebug'

const DEBUG = Boolean(import.meta.env?.DEV)

// Lazy load all other routes - major bundle size reduction
const ProfilePage = lazy(() => import('./ui/pages/ProfilePage').then(m => ({ default: m.ProfilePage })))
const ConversationPage = lazy(() => import('./ui/pages/ConversationPage').then(m => ({ default: m.ConversationPage })))
const QuizPage = lazy(() => import('./ui/pages/QuizPage').then(m => ({ default: m.QuizPage })))
const QuizResultsPage = lazy(() => import('./ui/pages/QuizResultsPage').then(m => ({ default: m.QuizResultsPage })))
const QuizDetailPage = lazy(() => import('./ui/pages/QuizDetailPage').then(m => ({ default: m.QuizDetailPage })))
const QuizPortalPage = lazy(() => import('./ui/pages/QuizPortalPage').then(m => ({ default: m.QuizPortalPage })))
const InterestsPortalPage = lazy(() => import('./ui/pages/InterestsPortalPage').then(m => ({ default: m.InterestsPortalPage })))
const PersonalityPortalPage = lazy(() => import('./ui/pages/PersonalityPortalPage').then(m => ({ default: m.PersonalityPortalPage })))
const ProfileSearchPage = lazy(() => import('./ui/pages/ProfileSearchPage').then(m => ({ default: m.ProfileSearchPage })))
const AuthPage = lazy(() => import('./ui/pages/AuthPage').then(m => ({ default: m.AuthPage })))
const ConnectionsPage = lazy(() => import('./ui/pages/ConnectionsPage').then(m => ({ default: m.ConnectionsPage })))

// Admin pages
const AdminDashboard = lazy(() => import('./admin/pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })))
const JobHistoryPage = lazy(() => import('./admin/pages/JobHistoryPage').then(m => ({ default: m.JobHistoryPage })))
const JobDetailsPage = lazy(() => import('./admin/pages/JobDetailsPage').then(m => ({ default: m.JobDetailsPage })))
const JobMonitorPage = lazy(() => import('./admin/pages/JobMonitorPage').then(m => ({ default: m.JobMonitorPage })))

// Minimal loading fallback for route transitions
function RouteLoader() {
  return null // Routes handle their own loading states
}

function LegacyConversationRedirect() {
  const { conversationId } = useParams()
  const target = conversationId
    ? `/connections/inbox/${encodeURIComponent(conversationId)}`
    : '/connections/inbox'
  return <Navigate to={target} replace />
}

export default function App() {
  if (DEBUG) {
    console.log('[DEBUG] App: Component rendering', { pathname: window.location.pathname, timestamp: Date.now() })
  }
  
  return (
    <SessionProvider>
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
            path="/connections"
            element={<Navigate to="/connections/inbox" replace />}
          />
          <Route
            path="/connections/conversation/:conversationId"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoader />}>
                  <ConversationPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/connections/:section"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoader />}>
                  <ConnectionsPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/matches"
            element={<Navigate to="/connections/matches" replace />}
          />
          <Route
            path="/followers"
            element={<Navigate to="/connections/followers" replace />}
          />
          <Route
            path="/inbox"
            element={<Navigate to="/connections/inbox" replace />}
          />
          <Route
            path="/connections/inbox/:conversationId"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoader />}>
                  <ConversationPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inbox/:conversationId"
            element={<LegacyConversationRedirect />}
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
            path="/quiz/:quizId/results"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoader />}>
                  <QuizResultsPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/quizzes"
            element={<Navigate to="/personality/quizzes" replace />}
          />
          <Route
            path="/personality"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoader />}>
                  <PersonalityPortalPage />
                </Suspense>
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="quizzes" replace />} />
            <Route
              path="quizzes"
              element={
                <Suspense fallback={<RouteLoader />}>
                  <QuizPortalPage />
                </Suspense>
              }
            />
            <Route
              path="quizzes/:quizId"
              element={
                <Suspense fallback={<RouteLoader />}>
                  <QuizDetailPage />
                </Suspense>
              }
            />
            <Route
              path="interests"
              element={
                <Suspense fallback={<RouteLoader />}>
                  <InterestsPortalPage />
                </Suspense>
              }
            />
          </Route>
          <Route
            path="/interests"
            element={<Navigate to="/personality/interests" replace />}
          />
          <Route
            path="/profiles/search"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoader />}>
                  <ProfileSearchPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={<Navigate to="/admin/dashboard" replace />}
          />
          <Route
            path="/admin/dashboard"
            element={
              <AdminRoute>
                <Suspense fallback={<RouteLoader />}>
                  <AdminDashboard />
                </Suspense>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/jobs/history"
            element={
              <AdminRoute>
                <Suspense fallback={<RouteLoader />}>
                  <JobHistoryPage />
                </Suspense>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/jobs/monitor"
            element={
              <AdminRoute>
                <Suspense fallback={<RouteLoader />}>
                  <JobMonitorPage />
                </Suspense>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/jobs/:jobRunId"
            element={
              <AdminRoute>
                <Suspense fallback={<RouteLoader />}>
                  <JobDetailsPage />
                </Suspense>
              </AdminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/feed" replace />} />
        </PageTransition>
        </AppShell>
      </ModalStateProvider>
    </SessionProvider>
  )
}
