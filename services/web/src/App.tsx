import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { AppLayout } from './components/AppLayout'
import { Spinner } from './components/Feedback'
import { useTheme } from './lib/theme'
import { LoginPage } from './pages/LoginPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { TaskDetailPage } from './pages/TaskDetailPage'
import { TaskListPage } from './pages/TaskListPage'
import { TokensPage } from './pages/TokensPage'
import './App.css'

function Shell() {
  const { status, loading, logout } = useAuth()
  const { theme, toggle } = useTheme()

  if (loading) {
    return (
      <main className="splash">
        <Spinner />
      </main>
    )
  }

  if (!status?.user) {
    return <LoginPage />
  }

  return (
    <AppLayout
      user={status.user}
      theme={theme}
      onToggleTheme={toggle}
      onLogout={() => void logout()}
    >
      <Routes>
        <Route path="/" element={<TaskListPage />} />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/tokens" element={<TokensPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
