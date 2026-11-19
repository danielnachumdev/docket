import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { AppLayout } from './components/AppLayout'
import { DialogsProvider } from './components/DialogsProvider'
import { Spinner } from './components/Feedback'
import { ToastProvider } from './components/ToastProvider'
import { PreferencesProvider, useTheme } from './preferences'
import { AccountPage } from './pages/AccountPage'
import { ArtifactsPage } from './pages/ArtifactsPage'
import { CollaboratorsPage } from './pages/CollaboratorsPage'
import { ExternalSharePage } from './pages/ExternalSharePage'
import { LoginPage } from './pages/LoginPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { ProgressPage } from './pages/ProgressPage'
import { RegisterPage } from './pages/RegisterPage'
import { TaskDetailPage } from './pages/TaskDetailPage'
import { TaskListPage } from './pages/TaskListPage'
import { StoragePage } from './pages/StoragePage'
import { TokensPage } from './pages/TokensPage'
import { WebhooksPage } from './pages/WebhooksPage'

function Shell() {
  const { status, loading, logout } = useAuth()
  const { themeScheme, toggle } = useTheme()
  const location = useLocation()
  const externalShareMatch = location.pathname.match(/^\/s\/([^/]+)\/?$/)
  const externalShareToken = externalShareMatch?.[1]

  if (loading) {
    return (
      <main className="splash">
        <Spinner />
      </main>
    )
  }

  if (externalShareToken) {
    return (
      <Routes>
        <Route path="/s/:token" element={<ExternalSharePage />} />
      </Routes>
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
      themeScheme={themeScheme}
      onToggleTheme={toggle}
      onLogout={() => void logout()}
      canAdmin={canInvite}
    >
      <Routes>
        <Route path="/" element={<TaskListPage />} />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/artifacts" element={<ArtifactsPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/tokens" element={<TokensPage />} />
        <Route path="/webhooks" element={<WebhooksPage />} />
        <Route
          path="/collaborators"
          element={<CollaboratorsPage canMint={canInvite} />}
        />
        <Route path="/people" element={<Navigate to="/collaborators" replace />} />
        <Route path="/invites" element={<Navigate to="/collaborators#invites" replace />} />
        <Route path="/account" element={<AccountPage />} />
        {canInvite && (
          <Route path="/storage" element={<StoragePage canAdmin={canInvite} />} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <PreferencesProvider>
        <ToastProvider>
          <DialogsProvider>
            <Shell />
          </DialogsProvider>
        </ToastProvider>
      </PreferencesProvider>
    </AuthProvider>
  )
}
