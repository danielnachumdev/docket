import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api, type UserPreferences } from './api'
import { useAuth } from './auth'
import i18n, {
  LOCALE_STORAGE_KEY,
  isSupportedLocale,
  resolveLocaleCode,
} from './i18n'
import {
  applyTheme,
  cacheTheme,
  storedTheme,
  systemTheme,
  type Theme,
} from './lib/theme'

type PreferencesContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setLocale: (locale: string) => void
  hydrated: boolean
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

function storedLocale(): NonNullable<UserPreferences['locale']> | null {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (!value) return null
    const code = resolveLocaleCode(value)
    if (code === 'en' || code === 'he') return code
    return isSupportedLocale(code) ? (code as 'en' | 'he') : null
  } catch {
    return null
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { status, loading: authLoading } = useAuth()
  const [theme, setThemeState] = useState<Theme>(() => storedTheme() ?? systemTheme())
  const [hydrated, setHydrated] = useState(false)
  const hydratedUserId = useRef<number | null>(null)
  const persistSeq = useRef(0)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const applyLocale = useCallback((locale: string) => {
    const code = resolveLocaleCode(locale)
    if (resolveLocaleCode(i18n.resolvedLanguage ?? i18n.language) !== code) {
      void i18n.changeLanguage(code)
    }
  }, [])

  const persist = useCallback(
    async (patch: Partial<UserPreferences>) => {
      if (!status?.user) return
      const seq = ++persistSeq.current
      const next = await api.patchPreferences(patch)
      if (seq !== persistSeq.current) return
      if (next.theme) {
        cacheTheme(next.theme)
        setThemeState(next.theme)
      }
      if (next.locale) applyLocale(next.locale)
    },
    [applyLocale, status?.user],
  )

  const hydrate = useCallback(async () => {
    const server = await api.getPreferences()
    const seed: Partial<UserPreferences> = {}

    if (server.theme) {
      cacheTheme(server.theme)
      setThemeState(server.theme)
    } else {
      const local = storedTheme()
      if (local) seed.theme = local
    }

    if (server.locale) {
      applyLocale(server.locale)
    } else {
      const local = storedLocale()
      if (local) seed.locale = local
    }

    if (Object.keys(seed).length > 0) {
      await api.patchPreferences(seed)
    }
  }, [applyLocale])

  useEffect(() => {
    if (authLoading) return
    const userId = status?.user?.id ?? null
    if (userId == null) {
      hydratedUserId.current = null
      setHydrated(false)
      return
    }
    if (hydratedUserId.current === userId) return
    hydratedUserId.current = userId
    setHydrated(false)
    void hydrate()
      .catch(() => {
        /* keep local cache on failure */
      })
      .finally(() => setHydrated(true))
  }, [authLoading, hydrate, status?.user?.id])

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next)
      cacheTheme(next)
      void persist({ theme: next })
    },
    [persist],
  )

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [setTheme, theme])

  const setLocale = useCallback(
    (locale: string) => {
      const code = resolveLocaleCode(locale)
      applyLocale(code)
      if (code === 'en' || code === 'he') {
        void persist({ locale: code })
      }
    },
    [applyLocale, persist],
  )

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, setLocale, hydrated }),
    [theme, setTheme, toggleTheme, setLocale, hydrated],
  )

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences requires PreferencesProvider')
  return ctx
}

/** Theme helpers backed by the preferences harness. */
export function useTheme() {
  const { theme, toggleTheme, setTheme } = usePreferences()
  return { theme, toggle: toggleTheme, setTheme }
}
