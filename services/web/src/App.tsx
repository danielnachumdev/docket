import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { LoginPage } from './pages/LoginPage'
import { TaskDetailPage } from './pages/TaskDetailPage'
import { TaskListPage } from './pages/TaskListPage'
import './App.css'

function Shell() {
  const { status, loading, logout } = useAuth()

  if (loading) {
    return (
      <main className="shell">
        <p className="muted">Loading…</p>
      </main>
    )
  }

  if (!status?.user) {
    return <LoginPage />
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Docket</span>
          <span className="muted small">human control plane</span>
        </div>
        <div className="topbar-right">
          <span className="muted small">{status.user.display_name}</span>
          <button type="button" className="ghost" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<TaskListPage />} />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
