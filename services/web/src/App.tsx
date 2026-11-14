import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { AppLayout } from './components/AppLayout'
import { Spinner } from './components/Feedback'
import { PreferencesProvider, useTheme } from './preferences'
import { ArtifactsPage } from './pages/ArtifactsPage'
import { InvitesPage } from './pages/InvitesPage'
import { LoginPage } from './pages/LoginPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { RegisterPage } from './pages/RegisterPage'
import { TaskDetailPage } from './pages/TaskDetailPage'
import { TaskListPage } from './pages/TaskListPage'
import { TokensPage } from './pages/TokensPage'
import { WebhooksPage } from './pages/WebhooksPage'
import './App.css'

function Shell() {
  const { status, loading, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const location = useLocation()

  if (loading) {
    return (
      <main className="splash">
        <Spinner />
      </main>
    )
  }

  const onRegister = location.pathname === '/register'
  if (!status?.user) {
    if (onRegister) return <RegisterPage />
    return <LoginPage />
  }

  const canInvite = status.permissions?.includes('users:admin') ?? false

  return (
    <AppLayout
      user={status.user}
      canInvite={canInvite}
      theme={theme}
      onToggleTheme={toggle}
      onLogout={() => void logout()}
    >
      <Routes>
        <Route path="/" element={<TaskListPage />} />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/artifacts" element={<ArtifactsPage />} />
        <Route path="/tokens" element={<TokensPage />} />
        <Route path="/webhooks" element={<WebhooksPage />} />
        {canInvite && <Route path="/invites" element={<InvitesPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <PreferencesProvider>
        <Shell />
      </PreferencesProvider>
    </AuthProvider>
  )
}
