import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './ui/shell/AppShell'
import { FeedPage } from './ui/pages/FeedPage'
import { ProfilePage } from './ui/pages/ProfilePage'
import { InboxPage } from './ui/pages/InboxPage'
import { ConversationPage } from './ui/pages/ConversationPage'
import { QuizPage } from './ui/pages/QuizPage'
import { AuthPage } from './ui/pages/AuthPage'
import { MatchesPage } from './ui/pages/MatchesPage'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/feed" replace />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/profiles/:userId" element={<ProfilePage />} />
        <Route path="/matches" element={<MatchesPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/inbox/:conversationId" element={<ConversationPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="*" element={<Navigate to="/feed" replace />} />
      </Routes>
    </AppShell>
  )
}
