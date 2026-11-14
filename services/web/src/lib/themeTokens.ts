/** Full UI theme packs: every token that differs across builtin themes. */

/** OS / CSS color-scheme footing (customs always use one of these). */
export type ColorScheme = 'light' | 'dark'
/** Soft builtins are light-footed. */
export type SoftBuiltinId = 'lilac' | 'sage' | 'sky' | 'sand'
export type BuiltinThemeId = ColorScheme | SoftBuiltinId
/** Active theme id: builtin or custom (`c_…`). */
export type ThemeId = string
export const BUILTIN_THEME_IDS: BuiltinThemeId[] = [
  'light',
  'dark',
  'lilac',
  'sage',
  'sky',
  'sand',
]
/** Accent swatches shown on soft builtin chips. */
export const BUILTIN_SWATCH: Partial<Record<BuiltinThemeId, string>> = {
  lilac: '#c47a9e',
  sage: '#6f9e86',
  sky: '#6e93c4',
  sand: '#d5bdaf',
}
export const CUSTOM_THEME_ID_RE = /^c_[a-z0-9]{8,24}$/
export const MAX_CUSTOM_THEMES = 20
export const MAX_THEME_NAME_LEN = 48
export const CUSTOM_THEMES_STORAGE_KEY = 'waymark.customThemes'

export function colorSchemeOf(builtin: BuiltinThemeId): ColorScheme {
  return builtin === 'dark' ? 'dark' : 'light'
}

/** Migrate retired builtin ids (e.g. pastel → lilac). */
export function canonicalizeThemeId(id: string): string {
  if (id === 'pastel') return 'lilac'
  return id
}

export type ThemeTokenKey =
  | 'bg'
  | 'surface'
  | 'surface-2'
  | 'surface-hover'
  | 'border'
  | 'border-strong'
  | 'text'
  | 'text-2'
  | 'muted'
  | 'accent'
  | 'accent-hover'
  | 'accent-soft'
  | 'accent-text'
  | 'danger'
  | 'danger-soft'
  | 'warning'
  | 'warning-soft'
  | 'success'
  | 'success-soft'
  | 'st-backlog'
  | 'st-in_progress'
  | 'st-blocked'
  | 'st-on_hold'
  | 'st-failed'
  | 'st-done'
  | 'st-cancelled'
  | 'p1'
  | 'p2'
  | 'p3'
  | 'p4'
  | 'shadow-sm'
  | 'shadow'
  | 'shadow-md'
  | 'shadow-lg'

export type ThemeTokens = Record<ThemeTokenKey, string>

export type ThemeTokenGroupId =
  | 'surfaces'
  | 'accent'
  | 'semantic'
  | 'status'
  | 'priority'
  | 'shadows'

export type ThemeTokenKind = 'color' | 'shadow'

export type ThemeTokenMeta = {
  key: ThemeTokenKey
  group: ThemeTokenGroupId
  kind: ThemeTokenKind
  /** i18n key under auth:themeTokens.* */
  labelKey: string
  /** i18n key under auth:themeTokens.* */
  hintKey: string
}

export const THEME_TOKEN_KEYS: ThemeTokenKey[] = [
  'bg',
  'surface',
  'surface-2',
  'surface-hover',
  'border',
  'border-strong',
  'text',
  'text-2',
  'muted',
  'accent',
  'accent-hover',
  'accent-soft',
  'accent-text',
  'danger',
  'danger-soft',
  'warning',
  'warning-soft',
  'success',
  'success-soft',
  'st-backlog',
  'st-in_progress',
  'st-blocked',
  'st-on_hold',
  'st-failed',
  'st-done',
  'st-cancelled',
  'p1',
  'p2',
  'p3',
  'p4',
  'shadow-sm',
  'shadow',
  'shadow-md',
  'shadow-lg',
]

export const THEME_TOKEN_META: ThemeTokenMeta[] = [
  {
    key: 'bg',
    group: 'surfaces',
    kind: 'color',
    labelKey: 'tokenBg',
    hintKey: 'tokenBgHint',
  },
  {
    key: 'surface',
    group: 'surfaces',
    kind: 'color',
    labelKey: 'tokenSurface',
    hintKey: 'tokenSurfaceHint',
  },
  {
    key: 'surface-2',
    group: 'surfaces',
    kind: 'color',
    labelKey: 'tokenSurface2',
    hintKey: 'tokenSurface2Hint',
  },
  {
    key: 'surface-hover',
    group: 'surfaces',
    kind: 'color',
    labelKey: 'tokenSurfaceHover',
    hintKey: 'tokenSurfaceHoverHint',
  },
  {
    key: 'border',
    group: 'surfaces',
    kind: 'color',
    labelKey: 'tokenBorder',
    hintKey: 'tokenBorderHint',
  },
  {
    key: 'border-strong',
    group: 'surfaces',
    kind: 'color',
    labelKey: 'tokenBorderStrong',
    hintKey: 'tokenBorderStrongHint',
  },
  {
    key: 'text',
    group: 'surfaces',
    kind: 'color',
    labelKey: 'tokenText',
    hintKey: 'tokenTextHint',
  },
  {
    key: 'text-2',
    group: 'surfaces',
    kind: 'color',
    labelKey: 'tokenText2',
    hintKey: 'tokenText2Hint',
  },
  {
    key: 'muted',
    group: 'surfaces',
    kind: 'color',
    labelKey: 'tokenMuted',
    hintKey: 'tokenMutedHint',
  },
  {
    key: 'accent',
    group: 'accent',
    kind: 'color',
    labelKey: 'tokenAccent',
    hintKey: 'tokenAccentHint',
  },
  {
    key: 'accent-hover',
    group: 'accent',
    kind: 'color',
    labelKey: 'tokenAccentHover',
    hintKey: 'tokenAccentHoverHint',
  },
  {
    key: 'accent-soft',
    group: 'accent',
    kind: 'color',
    labelKey: 'tokenAccentSoft',
    hintKey: 'tokenAccentSoftHint',
  },
  {
    key: 'accent-text',
    group: 'accent',
    kind: 'color',
    labelKey: 'tokenAccentText',
    hintKey: 'tokenAccentTextHint',
  },
  {
    key: 'danger',
    group: 'semantic',
    kind: 'color',
    labelKey: 'tokenDanger',
    hintKey: 'tokenDangerHint',
  },
  {
    key: 'danger-soft',
    group: 'semantic',
    kind: 'color',
    labelKey: 'tokenDangerSoft',
    hintKey: 'tokenDangerSoftHint',
  },
  {
    key: 'warning',
    group: 'semantic',
    kind: 'color',
    labelKey: 'tokenWarning',
    hintKey: 'tokenWarningHint',
  },
  {
    key: 'warning-soft',
    group: 'semantic',
    kind: 'color',
    labelKey: 'tokenWarningSoft',
    hintKey: 'tokenWarningSoftHint',
  },
  {
    key: 'success',
    group: 'semantic',
    kind: 'color',
    labelKey: 'tokenSuccess',
    hintKey: 'tokenSuccessHint',
  },
  {
    key: 'success-soft',
    group: 'semantic',
    kind: 'color',
    labelKey: 'tokenSuccessSoft',
    hintKey: 'tokenSuccessSoftHint',
  },
  {
    key: 'st-backlog',
    group: 'status',
    kind: 'color',
    labelKey: 'tokenStBacklog',
    hintKey: 'tokenStBacklogHint',
  },
  {
    key: 'st-in_progress',
    group: 'status',
    kind: 'color',
    labelKey: 'tokenStInProgress',
    hintKey: 'tokenStInProgressHint',
  },
  {
    key: 'st-blocked',
    group: 'status',
    kind: 'color',
    labelKey: 'tokenStBlocked',
    hintKey: 'tokenStBlockedHint',
  },
  {
    key: 'st-on_hold',
    group: 'status',
    kind: 'color',
    labelKey: 'tokenStOnHold',
    hintKey: 'tokenStOnHoldHint',
  },
  {
    key: 'st-failed',
    group: 'status',
    kind: 'color',
    labelKey: 'tokenStFailed',
    hintKey: 'tokenStFailedHint',
  },
  {
    key: 'st-done',
    group: 'status',
    kind: 'color',
    labelKey: 'tokenStDone',
    hintKey: 'tokenStDoneHint',
  },
  {
    key: 'st-cancelled',
    group: 'status',
    kind: 'color',
    labelKey: 'tokenStCancelled',
    hintKey: 'tokenStCancelledHint',
  },
  {
    key: 'p1',
    group: 'priority',
    kind: 'color',
    labelKey: 'tokenP1',
    hintKey: 'tokenP1Hint',
  },
  {
    key: 'p2',
    group: 'priority',
    kind: 'color',
    labelKey: 'tokenP2',
    hintKey: 'tokenP2Hint',
  },
  {
    key: 'p3',
    group: 'priority',
    kind: 'color',
    labelKey: 'tokenP3',
    hintKey: 'tokenP3Hint',
  },
  {
    key: 'p4',
    group: 'priority',
    kind: 'color',
    labelKey: 'tokenP4',
    hintKey: 'tokenP4Hint',
  },
  {
    key: 'shadow-sm',
    group: 'shadows',
    kind: 'shadow',
    labelKey: 'tokenShadowSm',
    hintKey: 'tokenShadowSmHint',
  },
  {
    key: 'shadow',
    group: 'shadows',
    kind: 'shadow',
    labelKey: 'tokenShadow',
    hintKey: 'tokenShadowHint',
  },
  {
    key: 'shadow-md',
    group: 'shadows',
    kind: 'shadow',
    labelKey: 'tokenShadowMd',
    hintKey: 'tokenShadowMdHint',
  },
  {
    key: 'shadow-lg',
    group: 'shadows',
    kind: 'shadow',
    labelKey: 'tokenShadowLg',
    hintKey: 'tokenShadowLgHint',
  },
]

export const THEME_GROUPS: { id: ThemeTokenGroupId; labelKey: string }[] = [
  { id: 'surfaces', labelKey: 'groupSurfaces' },
  { id: 'accent', labelKey: 'groupAccent' },
  { id: 'semantic', labelKey: 'groupSemantic' },
  { id: 'status', labelKey: 'groupStatus' },
  { id: 'priority', labelKey: 'groupPriority' },
  { id: 'shadows', labelKey: 'groupShadows' },
]

/** Builtin Light — matches services/web/src/index.css :root */
export const LIGHT_THEME: ThemeTokens = {
  bg: '#f6f7f9',
  surface: '#ffffff',
  'surface-2': '#f1f3f6',
  'surface-hover': '#f4f5f8',
  border: '#e3e6eb',
  'border-strong': '#d0d5dd',
  text: '#14171f',
  'text-2': '#3d4350',
  muted: '#6b7280',
  accent: '#4f46e5',
  'accent-hover': '#4338ca',
  'accent-soft': '#eef0ff',
  'accent-text': '#ffffff',
  danger: '#dc2626',
  'danger-soft': '#fdecec',
  warning: '#b45309',
  'warning-soft': '#fdf3e2',
  success: '#15803d',
  'success-soft': '#e8f6ed',
  'st-backlog': '#64748b',
  'st-in_progress': '#16a34a',
  'st-blocked': '#dc2626',
  'st-on_hold': '#ca8a04',
  'st-failed': '#171717',
  'st-done': '#2563eb',
  'st-cancelled': '#7c3aed',
  p1: '#dc2626',
  p2: '#ea580c',
  p3: '#2563eb',
  p4: '#94a3b8',
  'shadow-sm': '0 1px 2px rgb(16 24 40 / 0.05)',
  shadow: '0 1px 3px rgb(16 24 40 / 0.06), 0 4px 12px rgb(16 24 40 / 0.04)',
  'shadow-md': '0 6px 18px rgb(16 24 40 / 0.1)',
  'shadow-lg': '0 12px 32px rgb(16 24 40 / 0.12)',
}

/** Builtin Dark — matches services/web/src/index.css :root[data-theme='dark'] */
export const DARK_THEME: ThemeTokens = {
  bg: '#0c0e12',
  surface: '#14171d',
  'surface-2': '#1a1e26',
  'surface-hover': '#1c2029',
  border: '#252a34',
  'border-strong': '#343b48',
  text: '#e8eaef',
  'text-2': '#c2c7d0',
  muted: '#8b93a3',
  accent: '#818cf8',
  'accent-hover': '#a5b4fc',
  'accent-soft': '#1e2140',
  'accent-text': '#0c0e12',
  danger: '#f87171',
  'danger-soft': '#2a1618',
  warning: '#fbbf24',
  'warning-soft': '#2a2213',
  success: '#4ade80',
  'success-soft': '#13261a',
  'st-backlog': '#94a3b8',
  'st-in_progress': '#4ade80',
  'st-blocked': '#f87171',
  'st-on_hold': '#fbbf24',
  'st-failed': '#fafafa',
  'st-done': '#60a5fa',
  'st-cancelled': '#a78bfa',
  p1: '#f87171',
  p2: '#fb923c',
  p3: '#60a5fa',
  p4: '#64748b',
  'shadow-sm': '0 1px 2px rgb(0 0 0 / 0.3)',
  shadow: '0 1px 3px rgb(0 0 0 / 0.35), 0 4px 12px rgb(0 0 0 / 0.2)',
  'shadow-md': '0 8px 22px rgb(0 0 0 / 0.4)',
  'shadow-lg': '0 16px 40px rgb(0 0 0 / 0.5)',
}

/**
 * Builtin Lilac — cool lilac mist + dusty rose (not cream/terracotta).
 */
export const LILAC_THEME: ThemeTokens = {
  bg: '#f3eef7',
  surface: '#fffbfe',
  'surface-2': '#efe8f4',
  'surface-hover': '#f7f2fa',
  border: '#e2d8eb',
  'border-strong': '#cfc0dc',
  text: '#2c2436',
  'text-2': '#5e546c',
  muted: '#90869e',
  accent: '#c47a9e',
  'accent-hover': '#a96386',
  'accent-soft': '#f6e7ef',
  'accent-text': '#fff9fc',
  danger: '#d67a8c',
  'danger-soft': '#f8e6ea',
  warning: '#c4a06e',
  'warning-soft': '#f6eedf',
  success: '#6fa894',
  'success-soft': '#e5f3ec',
  'st-backlog': '#9b91ab',
  'st-in_progress': '#6fa894',
  'st-blocked': '#d67a8c',
  'st-on_hold': '#c4a06e',
  'st-failed': '#5e546c',
  'st-done': '#7f94c2',
  'st-cancelled': '#a78cbc',
  p1: '#d67a8c',
  p2: '#d4a07c',
  p3: '#7f94c2',
  p4: '#b3a9c0',
  'shadow-sm': '0 1px 2px rgb(90 60 110 / 0.06)',
  shadow: '0 1px 3px rgb(90 60 110 / 0.07), 0 4px 14px rgb(90 60 110 / 0.05)',
  'shadow-md': '0 8px 22px rgb(90 60 110 / 0.1)',
  'shadow-lg': '0 14px 36px rgb(90 60 110 / 0.14)',
}

/** Builtin Sage — eucalyptus mist + soft leaf green. */
export const SAGE_THEME: ThemeTokens = {
  bg: '#eef4f0',
  surface: '#fbfefc',
  'surface-2': '#e5eee8',
  'surface-hover': '#f3f8f5',
  border: '#d5e2da',
  'border-strong': '#b7cbc0',
  text: '#24302a',
  'text-2': '#4d5e55',
  muted: '#7d8f85',
  accent: '#6f9e86',
  'accent-hover': '#588570',
  'accent-soft': '#e4f0e9',
  'accent-text': '#f7fcf9',
  danger: '#c97b7b',
  'danger-soft': '#f6e8e8',
  warning: '#b9975c',
  'warning-soft': '#f4ecdf',
  success: '#5d9a78',
  'success-soft': '#e1f0e7',
  'st-backlog': '#8a9a91',
  'st-in_progress': '#5d9a78',
  'st-blocked': '#c97b7b',
  'st-on_hold': '#b9975c',
  'st-failed': '#4d5e55',
  'st-done': '#6a92b0',
  'st-cancelled': '#8f9cba',
  p1: '#c97b7b',
  p2: '#c49a6c',
  p3: '#6a92b0',
  p4: '#9aada3',
  'shadow-sm': '0 1px 2px rgb(40 70 55 / 0.06)',
  shadow: '0 1px 3px rgb(40 70 55 / 0.07), 0 4px 14px rgb(40 70 55 / 0.05)',
  'shadow-md': '0 8px 22px rgb(40 70 55 / 0.1)',
  'shadow-lg': '0 14px 36px rgb(40 70 55 / 0.13)',
}

/** Builtin Sky — powder blue mist + soft periwinkle. */
export const SKY_THEME: ThemeTokens = {
  bg: '#eef3f8',
  surface: '#fbfdff',
  'surface-2': '#e5edf5',
  'surface-hover': '#f3f7fb',
  border: '#d5e0ec',
  'border-strong': '#b7c8da',
  text: '#222a36',
  'text-2': '#4d596a',
  muted: '#7d8a9a',
  accent: '#6e93c4',
  'accent-hover': '#5879a8',
  'accent-soft': '#e4edf7',
  'accent-text': '#f7fbff',
  danger: '#d07f8e',
  'danger-soft': '#f7e8ec',
  warning: '#c09a62',
  'warning-soft': '#f5eddf',
  success: '#5f9a86',
  'success-soft': '#e2f1eb',
  'st-backlog': '#8a95a5',
  'st-in_progress': '#5f9a86',
  'st-blocked': '#d07f8e',
  'st-on_hold': '#c09a62',
  'st-failed': '#4d596a',
  'st-done': '#6e93c4',
  'st-cancelled': '#8f8cba',
  p1: '#d07f8e',
  p2: '#c49a6c',
  p3: '#6e93c4',
  p4: '#9aa8b8',
  'shadow-sm': '0 1px 2px rgb(50 70 100 / 0.06)',
  shadow: '0 1px 3px rgb(50 70 100 / 0.07), 0 4px 14px rgb(50 70 100 / 0.05)',
  'shadow-md': '0 8px 22px rgb(50 70 100 / 0.1)',
  'shadow-lg': '0 14px 36px rgb(50 70 100 / 0.13)',
}

/**
 * Builtin Sand — Coolors edede9 / d6ccc2 / f5ebe0 / e3d5ca / d5bdaf.
 * Warm linen neutrals; deepest taupe as accent.
 */
export const SAND_THEME: ThemeTokens = {
  bg: '#f5ebe0',
  surface: '#edede9',
  'surface-2': '#e3d5ca',
  'surface-hover': '#ebe4dc',
  border: '#d6ccc2',
  'border-strong': '#d5bdaf',
  text: '#3a322c',
  'text-2': '#5c534c',
  muted: '#8f857c',
  accent: '#d5bdaf',
  'accent-hover': '#c4a898',
  'accent-soft': '#efe6dc',
  'accent-text': '#2f2924',
  danger: '#c47d74',
  'danger-soft': '#f3e4e0',
  warning: '#b8956a',
  'warning-soft': '#f3eadc',
  success: '#7a9a7e',
  'success-soft': '#e5eee6',
  'st-backlog': '#a3988e',
  'st-in_progress': '#7a9a7e',
  'st-blocked': '#c47d74',
  'st-on_hold': '#b8956a',
  'st-failed': '#5c534c',
  'st-done': '#8a9aab',
  'st-cancelled': '#a392a8',
  p1: '#c47d74',
  p2: '#c49a6c',
  p3: '#8a9aab',
  p4: '#b0a59c',
  'shadow-sm': '0 1px 2px rgb(90 70 55 / 0.07)',
  shadow: '0 1px 3px rgb(90 70 55 / 0.08), 0 4px 14px rgb(90 70 55 / 0.06)',
  'shadow-md': '0 8px 22px rgb(90 70 55 / 0.11)',
  'shadow-lg': '0 14px 36px rgb(90 70 55 / 0.14)',
}

export const BUILTIN_THEMES: Record<BuiltinThemeId, ThemeTokens> = {
  light: LIGHT_THEME,
  dark: DARK_THEME,
  lilac: LILAC_THEME,
  sage: SAGE_THEME,
  sky: SKY_THEME,
  sand: SAND_THEME,
}

export type CustomTheme = {
  id: string
  name: string
  /** Color-scheme footing when this custom pack is active. */
  base: ColorScheme
  tokens: ThemeTokens
}

export function isColorScheme(id: string): id is ColorScheme {
  return id === 'light' || id === 'dark'
}

export function isBuiltinThemeId(id: string): id is BuiltinThemeId {
  return (
    id === 'light' ||
    id === 'dark' ||
    id === 'lilac' ||
    id === 'sage' ||
    id === 'sky' ||
    id === 'sand'
  )
}

export function isCustomThemeId(id: string): boolean {
  return CUSTOM_THEME_ID_RE.test(id)
}

export function newCustomThemeId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `c_${hex}`
}

export function cssVarName(key: ThemeTokenKey): string {
  return `--${key}`
}

export function tokensToStyle(tokens: ThemeTokens): Record<string, string> {
  const style: Record<string, string> = {}
  for (const key of THEME_TOKEN_KEYS) {
    style[cssVarName(key)] = tokens[key]
  }
  return style
}

export function applyThemeTokens(
  appearance: BuiltinThemeId | ColorScheme,
  scheme: ColorScheme,
  tokens: ThemeTokens,
): void {
  const root = document.documentElement
  root.dataset.theme = appearance
  root.style.colorScheme = scheme
  for (const key of THEME_TOKEN_KEYS) {
    root.style.setProperty(cssVarName(key), tokens[key])
  }
}

export function resolveThemePack(
  themeId: ThemeId,
  customThemes: CustomTheme[],
): {
  appearance: BuiltinThemeId | ColorScheme
  scheme: ColorScheme
  tokens: ThemeTokens
  custom: CustomTheme | null
} {
  if (isBuiltinThemeId(themeId)) {
    return {
      appearance: themeId,
      scheme: colorSchemeOf(themeId),
      tokens: BUILTIN_THEMES[themeId],
      custom: null,
    }
  }
  const custom = customThemes.find((t) => t.id === themeId) ?? null
  if (custom) {
    return {
      appearance: custom.base,
      scheme: custom.base,
      tokens: custom.tokens,
      custom,
    }
  }
  return {
    appearance: 'light',
    scheme: 'light',
    tokens: BUILTIN_THEMES.light,
    custom: null,
  }
}

export function cloneTokens(tokens: ThemeTokens): ThemeTokens {
  return { ...tokens }
}

export function storedCustomThemes(): CustomTheme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isStoredCustomTheme)
  } catch {
    return []
  }
}

export function cacheCustomThemes(themes: CustomTheme[]): void {
  try {
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes))
  } catch {
    /* ignore quota / private mode */
  }
}

function isStoredCustomTheme(value: unknown): value is CustomTheme {
  if (!value || typeof value !== 'object') return false
  const t = value as CustomTheme
  return (
    typeof t.id === 'string' &&
    isCustomThemeId(t.id) &&
    typeof t.name === 'string' &&
    isColorScheme(t.base) &&
    !!t.tokens &&
    typeof t.tokens === 'object'
  )
}

/** Normalize #rgb → #rrggbb for <input type="color">. */
export function toColorInputValue(value: string): string {
  const v = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1]
    const g = v[2]
    const b = v[3]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return '#000000'
}

export function isHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())
}
