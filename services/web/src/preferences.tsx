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
import {
  api,
  type CustomThemePreference,
  type TaskSortMode,
  type UserPreferences,
} from './api'
import { useAuth } from './auth'
import i18n, {
  LOCALE_STORAGE_KEY,
  isSupportedLocale,
  resolveLocaleCode,
} from './i18n'
import {
  applyTheme,
  cacheTheme,
  readCustomThemes,
  resolveThemeScheme,
  storedTheme,
  systemTheme,
  writeCustomThemes,
  type Theme,
} from './lib/theme'
import {
  BUILTIN_THEMES,
  MAX_CUSTOM_THEMES,
  MAX_THEME_NAME_LEN,
  canonicalizeThemeId,
  cloneTokens,
  isBuiltinThemeId,
  isColorScheme,
  newCustomThemeId,
  resolveThemePack,
  type ColorScheme,
  type CustomTheme,
  type ThemeTokenKey,
  type ThemeTokens,
} from './lib/themeTokens'

const THEME_PERSIST_MS = 400
/** First-paint / guest cache for list sort mode; server wins when authenticated. */
export const TASK_SORT_MODE_STORAGE_KEY = 'waymark.taskSortMode'

type PreferencesContextValue = {
  theme: Theme
  themeScheme: ColorScheme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setLocale: (locale: string) => void
  taskSortMode: TaskSortMode
  setTaskSortMode: (mode: TaskSortMode) => void
  customThemes: CustomTheme[]
  addCustomTheme: (fromThemeId?: Theme) => CustomTheme | null
  renameCustomTheme: (id: string, name: string) => void
  deleteCustomTheme: (id: string) => void
  setCustomThemeToken: (id: string, key: ThemeTokenKey, value: string) => void
  resetCustomThemeTokens: (id: string) => void
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

function isTaskSortMode(value: string): value is TaskSortMode {
  return value === 'custom' || value === 'date'
}

function storedTaskSortMode(): TaskSortMode | null {
  try {
    const value = localStorage.getItem(TASK_SORT_MODE_STORAGE_KEY)
    if (!value || !isTaskSortMode(value)) return null
    return value
  } catch {
    return null
  }
}

function cacheTaskSortMode(mode: TaskSortMode) {
  try {
    localStorage.setItem(TASK_SORT_MODE_STORAGE_KEY, mode)
  } catch {
    /* ignore quota / private mode */
  }
}

function normalizeCustomThemes(
  raw: CustomThemePreference[] | null | undefined,
): CustomTheme[] {
  if (!Array.isArray(raw)) return []
  const out: CustomTheme[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    if (!item.id || !item.name || !isColorScheme(item.base)) continue
    if (!item.tokens || typeof item.tokens !== 'object') continue
    const baseTokens = BUILTIN_THEMES[item.base]
    const tokens = { ...baseTokens, ...item.tokens } as ThemeTokens
    out.push({
      id: item.id,
      name: item.name,
      base: item.base,
      tokens,
    })
  }
  return out
}

function toPreferenceThemes(themes: CustomTheme[]): CustomThemePreference[] {
  return themes.map((t) => ({
    id: t.id,
    name: t.name,
    base: t.base,
    tokens: { ...t.tokens },
  }))
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { status, loading: authLoading } = useAuth()
  const [theme, setThemeState] = useState<Theme>(() => storedTheme() ?? systemTheme())
  const [customThemes, setCustomThemesState] = useState<CustomTheme[]>(() => readCustomThemes())
  const [taskSortMode, setTaskSortModeState] = useState<TaskSortMode>(
    () => storedTaskSortMode() ?? 'date',
  )
  const [hydrated, setHydrated] = useState(false)
  const hydratedUserId = useRef<number | null>(null)
  const persistSeq = useRef(0)
  const themesPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const themeScheme = useMemo(
    () => resolveThemeScheme(theme, customThemes),
    [theme, customThemes],
  )

  useEffect(() => {
    applyTheme(theme, customThemes)
  }, [theme, customThemes])

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
      if (next.task_sort_mode) {
        cacheTaskSortMode(next.task_sort_mode)
        setTaskSortModeState(next.task_sort_mode)
      }
      if (next.custom_themes != null) {
        const normalized = normalizeCustomThemes(next.custom_themes)
        writeCustomThemes(normalized)
        setCustomThemesState(normalized)
      } else if (next.custom_themes === null && 'custom_themes' in patch) {
        writeCustomThemes([])
        setCustomThemesState([])
      }
    },
    [applyLocale, status?.user],
  )

  const persistCatalogSoon = useCallback(
    (themes: CustomTheme[], active?: Theme) => {
      writeCustomThemes(themes)
      if (active) cacheTheme(active)
      if (!status?.user) return
      if (themesPersistTimer.current) clearTimeout(themesPersistTimer.current)
      themesPersistTimer.current = setTimeout(() => {
        themesPersistTimer.current = null
        const patch: Partial<UserPreferences> = {
          custom_themes: toPreferenceThemes(themes),
        }
        if (active) patch.theme = active
        void persist(patch)
      }, THEME_PERSIST_MS)
    },
    [persist, status?.user],
  )

  useEffect(() => {
    return () => {
      if (themesPersistTimer.current) clearTimeout(themesPersistTimer.current)
    }
  }, [])

  const hydrate = useCallback(async () => {
    const server = await api.getPreferences()
    const seed: Partial<UserPreferences> = {}

    let nextCustoms = readCustomThemes()
    if (server.custom_themes != null) {
      nextCustoms = normalizeCustomThemes(server.custom_themes)
      writeCustomThemes(nextCustoms)
      setCustomThemesState(nextCustoms)
    } else if (nextCustoms.length > 0) {
      seed.custom_themes = toPreferenceThemes(nextCustoms)
      setCustomThemesState(nextCustoms)
    }

    if (server.theme) {
      const themeId = canonicalizeThemeId(server.theme)
      const pack = resolveThemePack(themeId, nextCustoms)
      const resolved =
        isBuiltinThemeId(themeId) || pack.custom ? themeId : systemTheme()
      cacheTheme(resolved)
      setThemeState(resolved)
      if (themeId !== server.theme) seed.theme = resolved
    } else {
      const local = storedTheme()
      if (local) {
        const pack = resolveThemePack(local, nextCustoms)
        if (isBuiltinThemeId(local) || pack.custom) seed.theme = local
      }
    }

    if (server.locale) {
      applyLocale(server.locale)
    } else {
      const local = storedLocale()
      if (local) seed.locale = local
    }

    if (server.task_sort_mode) {
      cacheTaskSortMode(server.task_sort_mode)
      setTaskSortModeState(server.task_sort_mode)
    } else {
      const local = storedTaskSortMode()
      const mode = local ?? 'date'
      seed.task_sort_mode = mode
      cacheTaskSortMode(mode)
      setTaskSortModeState(mode)
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
    setTheme(themeScheme === 'dark' ? 'light' : 'dark')
  }, [setTheme, themeScheme])

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

  const setTaskSortMode = useCallback(
    (mode: TaskSortMode) => {
      setTaskSortModeState(mode)
      cacheTaskSortMode(mode)
      void persist({ task_sort_mode: mode })
    },
    [persist],
  )

  const addCustomTheme = useCallback(
    (fromThemeId?: Theme) => {
      if (customThemes.length >= MAX_CUSTOM_THEMES) return null
      const sourceId = fromThemeId ?? theme
      const pack = resolveThemePack(sourceId, customThemes)
      const id = newCustomThemeId()
      const builtinNames: Record<string, string> = {
        light: 'Light',
        dark: 'Dark',
        lilac: 'Lilac',
        sage: 'Sage',
        sky: 'Sky',
        sand: 'Sand',
        dusk: 'Dusk',
        slate: 'Slate',
      }
      const nameBase =
        pack.custom?.name ??
        builtinNames[sourceId] ??
        (pack.scheme === 'dark' ? 'Dark' : 'Light')
      let name = `${nameBase} copy`
      const existing = new Set(customThemes.map((t) => t.name.toLowerCase()))
      let n = 2
      while (existing.has(name.toLowerCase())) {
        name = `${nameBase} copy ${n}`
        n += 1
      }
      if (name.length > MAX_THEME_NAME_LEN) name = name.slice(0, MAX_THEME_NAME_LEN)
      const created: CustomTheme = {
        id,
        name,
        base: pack.scheme,
        tokens: cloneTokens(pack.tokens),
      }
      const next = [...customThemes, created]
      setCustomThemesState(next)
      setThemeState(id)
      persistCatalogSoon(next, id)
      return created
    },
    [customThemes, persistCatalogSoon, theme],
  )

  const renameCustomTheme = useCallback(
    (id: string, name: string) => {
      const cleaned = name.replace(/\s+/g, ' ').trim().slice(0, MAX_THEME_NAME_LEN)
      if (!cleaned) return
      const next = customThemes.map((t) => (t.id === id ? { ...t, name: cleaned } : t))
      setCustomThemesState(next)
      persistCatalogSoon(next)
    },
    [customThemes, persistCatalogSoon],
  )

  const deleteCustomTheme = useCallback(
    (id: string) => {
      const doomed = customThemes.find((t) => t.id === id)
      const next = customThemes.filter((t) => t.id !== id)
      setCustomThemesState(next)
      let active = theme
      if (theme === id) {
        active = doomed?.base ?? 'light'
        setThemeState(active)
      }
      persistCatalogSoon(next, active)
    },
    [customThemes, persistCatalogSoon, theme],
  )

  const setCustomThemeToken = useCallback(
    (id: string, key: ThemeTokenKey, value: string) => {
      const next = customThemes.map((t) =>
        t.id === id ? { ...t, tokens: { ...t.tokens, [key]: value } } : t,
      )
      setCustomThemesState(next)
      persistCatalogSoon(next)
    },
    [customThemes, persistCatalogSoon],
  )

  const resetCustomThemeTokens = useCallback(
    (id: string) => {
      const next = customThemes.map((t) =>
        t.id === id ? { ...t, tokens: cloneTokens(BUILTIN_THEMES[t.base]) } : t,
      )
      setCustomThemesState(next)
      persistCatalogSoon(next)
    },
    [customThemes, persistCatalogSoon],
  )

  const value = useMemo(
    () => ({
      theme,
      themeScheme,
      setTheme,
      toggleTheme,
      setLocale,
      taskSortMode,
      setTaskSortMode,
      customThemes,
      addCustomTheme,
      renameCustomTheme,
      deleteCustomTheme,
      setCustomThemeToken,
      resetCustomThemeTokens,
      hydrated,
    }),
    [
      theme,
      themeScheme,
      setTheme,
      toggleTheme,
      setLocale,
      taskSortMode,
      setTaskSortMode,
      customThemes,
      addCustomTheme,
      renameCustomTheme,
      deleteCustomTheme,
      setCustomThemeToken,
      resetCustomThemeTokens,
      hydrated,
    ],
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
  const { theme, themeScheme, toggleTheme, setTheme } = usePreferences()
  return { theme, themeScheme, toggle: toggleTheme, setTheme }
}
