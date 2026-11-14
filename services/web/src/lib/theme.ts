import {
  applyThemeTokens,
  cacheCustomThemes,
  canonicalizeThemeId,
  isBuiltinThemeId,
  resolveThemePack,
  storedCustomThemes,
  type BuiltinThemeId,
  type ColorScheme,
  type CustomTheme,
  type ThemeId,
  type ThemeTokens,
} from './themeTokens'

export type Theme = ThemeId
export type { BuiltinThemeId, ColorScheme, CustomTheme, ThemeTokens }

export const THEME_STORAGE_KEY = 'waymark.theme'

export function systemTheme(): ColorScheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    if (!value) return null
    const id = canonicalizeThemeId(value)
    if (isBuiltinThemeId(id)) return id
    if (id.startsWith('c_')) return id
    return null
  } catch {
    return null
  }
}

export function cacheTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* ignore quota / private mode */
  }
}

export function writeCustomThemes(themes: CustomTheme[]): void {
  cacheCustomThemes(themes)
}

export function readCustomThemes(): CustomTheme[] {
  return storedCustomThemes()
}

export function applyTheme(theme: Theme, customThemes: CustomTheme[] = readCustomThemes()): void {
  const pack = resolveThemePack(theme, customThemes)
  applyThemeTokens(pack.appearance, pack.scheme, pack.tokens)
}

export function resolveThemeScheme(
  theme: Theme,
  customThemes: CustomTheme[] = readCustomThemes(),
): ColorScheme {
  return resolveThemePack(theme, customThemes).scheme
}

export function resolveActiveTokens(
  theme: Theme,
  customThemes: CustomTheme[] = readCustomThemes(),
): ThemeTokens {
  return resolveThemePack(theme, customThemes).tokens
}
