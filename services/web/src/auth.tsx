import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, type AuthStatus, type User } from './api'

type AuthContextValue = {
  status: AuthStatus | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  bootstrap: (input: {
    email: string
    display_name: string
    password: string
  }) => Promise<void>
  login: (input: { email: string; password: string }) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    const next = await api.status()
    setStatus(next)
  }, [])

  useEffect(() => {
    void refresh()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [refresh])

  const bootstrap = useCallback(
    async (input: { email: string; display_name: string; password: string }) => {
      const user = await api.bootstrap(input)
      setStatus({ bootstrapped: true, user })
    },
    [],
  )

  const login = useCallback(async (input: { email: string; password: string }) => {
    const user = await api.login(input)
    setStatus({ bootstrapped: true, user })
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setStatus((prev) => ({ bootstrapped: prev?.bootstrapped ?? true, user: null }))
  }, [])

  const setUser = useCallback((user: User | null) => {
    setStatus((prev) => ({ bootstrapped: prev?.bootstrapped ?? true, user }))
  }, [])

  const value = useMemo(
    () => ({ status, loading, error, refresh, bootstrap, login, logout, setUser }),
    [status, loading, error, refresh, bootstrap, login, logout, setUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth requires AuthProvider')
  return ctx
}
