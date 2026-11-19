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
  DEFAULT_NOTIFICATION_KINDS,
  NOTIFICATION_KINDS,
  type CustomThemePreference,
  type DateFormat,
  type NotificationKind,
  type NotificationSort,
  type TaskSortMode,
  type TimeFormat,
  type UserPreferences,
} from './api'
import { useAuth } from './auth'
import i18n, {
  LOCALE_STORAGE_KEY,
  isSupportedLocale,
  resolveLocaleCode,
} from './i18n'
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_FORMAT,
  configureDateTimeFormat,
  isDateFormat,
  isTimeFormat,
} from './lib/format'
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
/** Guest / first-paint cache; authenticated users use `/api/me/preferences`. */
export const NOTIFICATION_KINDS_STORAGE_KEY = 'waymark.notificationKinds'
export const NOTIFICATION_SORT_STORAGE_KEY = 'waymark.notificationSort'
export const DATE_FORMAT_STORAGE_KEY = 'waymark.dateFormat'
export const TIME_FORMAT_STORAGE_KEY = 'waymark.timeFormat'

type PreferencesContextValue = {
  theme: Theme
  themeScheme: ColorScheme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setLocale: (locale: string) => void
  taskSortMode: TaskSortMode
  setTaskSortMode: (mode: TaskSortMode) => void
  notificationKinds: NotificationKind[]
  setNotificationKinds: (kinds: NotificationKind[]) => void
  notificationSort: NotificationSort
  setNotificationSort: (sort: NotificationSort) => void
  dateFormat: DateFormat
  setDateFormat: (format: DateFormat) => void
  timeFormat: TimeFormat
  setTimeFormat: (format: TimeFormat) => void
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

function isNotificationSort(value: string): value is NotificationSort {
  return value === 'newest' || value === 'oldest'
}

function isNotificationKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(value)
}

function normalizeNotificationKinds(raw: unknown): NotificationKind[] | null {
  if (!Array.isArray(raw)) return null
  const out: NotificationKind[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string' || !isNotificationKind(item) || seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
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

function storedNotificationKinds(): NotificationKind[] | null {
  try {
    const value = localStorage.getItem(NOTIFICATION_KINDS_STORAGE_KEY)
    if (!value) return null
    return normalizeNotificationKinds(JSON.parse(value))
  } catch {
    return null
  }
}

function cacheNotificationKinds(kinds: NotificationKind[]) {
  try {
    localStorage.setItem(NOTIFICATION_KINDS_STORAGE_KEY, JSON.stringify(kinds))
  } catch {
    /* ignore quota / private mode */
  }
}

function storedNotificationSort(): NotificationSort | null {
  try {
    const value = localStorage.getItem(NOTIFICATION_SORT_STORAGE_KEY)
    if (!value || !isNotificationSort(value)) return null
    return value
  } catch {
    return null
  }
}

function cacheNotificationSort(sort: NotificationSort) {
  try {
    localStorage.setItem(NOTIFICATION_SORT_STORAGE_KEY, sort)
  } catch {
    /* ignore quota / private mode */
  }
}

function storedDateFormat(): DateFormat | null {
  try {
    const value = localStorage.getItem(DATE_FORMAT_STORAGE_KEY)
    if (!value || !isDateFormat(value)) return null
    return value
  } catch {
    return null
  }
}

function cacheDateFormat(format: DateFormat) {
  try {
    localStorage.setItem(DATE_FORMAT_STORAGE_KEY, format)
  } catch {
    /* ignore quota / private mode */
  }
}

function storedTimeFormat(): TimeFormat | null {
  try {
    const value = localStorage.getItem(TIME_FORMAT_STORAGE_KEY)
    if (!value || !isTimeFormat(value)) return null
    return value
  } catch {
    return null
  }
}

function cacheTimeFormat(format: TimeFormat) {
  try {
    localStorage.setItem(TIME_FORMAT_STORAGE_KEY, format)
  } catch {
    /* ignore quota / private mode */
  }
}

function applyDateTimeFormats(dateFormat: DateFormat, timeFormat: TimeFormat) {
  configureDateTimeFormat(dateFormat, timeFormat)
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
  const [notificationKinds, setNotificationKindsState] = useState<NotificationKind[]>(
    () => storedNotificationKinds() ?? [...DEFAULT_NOTIFICATION_KINDS],
  )
  const [notificationSort, setNotificationSortState] = useState<NotificationSort>(
    () => storedNotificationSort() ?? 'newest',
  )
  const [dateFormat, setDateFormatState] = useState<DateFormat>(
    () => storedDateFormat() ?? DEFAULT_DATE_FORMAT,
  )
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>(
    () => storedTimeFormat() ?? DEFAULT_TIME_FORMAT,
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

  useEffect(() => {
    applyDateTimeFormats(dateFormat, timeFormat)
  }, [dateFormat, timeFormat])

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
      if (next.notification_kinds != null) {
        const kinds = normalizeNotificationKinds(next.notification_kinds) ?? [
          ...DEFAULT_NOTIFICATION_KINDS,
        ]
        cacheNotificationKinds(kinds)
        setNotificationKindsState(kinds)
      }
      if (next.notification_sort) {
        cacheNotificationSort(next.notification_sort)
        setNotificationSortState(next.notification_sort)
      }
      if (next.date_format) {
        cacheDateFormat(next.date_format)
        setDateFormatState(next.date_format)
      }
      if (next.time_format) {
        cacheTimeFormat(next.time_format)
        setTimeFormatState(next.time_format)
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

    if (server.notification_kinds != null) {
      const kinds = normalizeNotificationKinds(server.notification_kinds) ?? [
        ...DEFAULT_NOTIFICATION_KINDS,
      ]
      cacheNotificationKinds(kinds)
      setNotificationKindsState(kinds)
    } else {
      const local = storedNotificationKinds()
      const kinds = local ?? [...DEFAULT_NOTIFICATION_KINDS]
      seed.notification_kinds = kinds
      cacheNotificationKinds(kinds)
      setNotificationKindsState(kinds)
    }

    if (server.notification_sort) {
      cacheNotificationSort(server.notification_sort)
      setNotificationSortState(server.notification_sort)
    } else {
      const local = storedNotificationSort()
      const sort = local ?? 'newest'
      seed.notification_sort = sort
      cacheNotificationSort(sort)
      setNotificationSortState(sort)
    }

    let nextDateFormat = DEFAULT_DATE_FORMAT
    if (server.date_format) {
      nextDateFormat = server.date_format
      cacheDateFormat(nextDateFormat)
      setDateFormatState(nextDateFormat)
    } else {
      nextDateFormat = storedDateFormat() ?? DEFAULT_DATE_FORMAT
      seed.date_format = nextDateFormat
      cacheDateFormat(nextDateFormat)
      setDateFormatState(nextDateFormat)
    }

    let nextTimeFormat = DEFAULT_TIME_FORMAT
    if (server.time_format) {
      nextTimeFormat = server.time_format
      cacheTimeFormat(nextTimeFormat)
      setTimeFormatState(nextTimeFormat)
    } else {
      nextTimeFormat = storedTimeFormat() ?? DEFAULT_TIME_FORMAT
      seed.time_format = nextTimeFormat
      cacheTimeFormat(nextTimeFormat)
      setTimeFormatState(nextTimeFormat)
    }
    applyDateTimeFormats(nextDateFormat, nextTimeFormat)

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

  const setNotificationKinds = useCallback(
    (kinds: NotificationKind[]) => {
      const cleaned = normalizeNotificationKinds(kinds) ?? []
      setNotificationKindsState(cleaned)
      cacheNotificationKinds(cleaned)
      void persist({ notification_kinds: cleaned })
    },
    [persist],
  )

  const setNotificationSort = useCallback(
    (sort: NotificationSort) => {
      setNotificationSortState(sort)
      cacheNotificationSort(sort)
      void persist({ notification_sort: sort })
    },
    [persist],
  )

  const setDateFormat = useCallback(
    (format: DateFormat) => {
      setDateFormatState(format)
      cacheDateFormat(format)
      applyDateTimeFormats(format, timeFormat)
      void persist({ date_format: format })
    },
    [persist, timeFormat],
  )

  const setTimeFormat = useCallback(
    (format: TimeFormat) => {
      setTimeFormatState(format)
      cacheTimeFormat(format)
      applyDateTimeFormats(dateFormat, format)
      void persist({ time_format: format })
    },
    [dateFormat, persist],
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
      notificationKinds,
      setNotificationKinds,
      notificationSort,
      setNotificationSort,
      dateFormat,
      setDateFormat,
      timeFormat,
      setTimeFormat,
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
      notificationKinds,
      setNotificationKinds,
      notificationSort,
      setNotificationSort,
      dateFormat,
      setDateFormat,
      timeFormat,
      setTimeFormat,
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
