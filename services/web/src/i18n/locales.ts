/**
 * Locale registry — add a language by:
 * 1. Creating `src/locales/<code>/*.json` (copy from `en/`)
 * 2. Importing those JSON files in `src/i18n/index.ts` and registering under `resources`
 * 3. Appending an entry here with the correct `dir` (`ltr` or `rtl`)
 *
 * Example RTL sketch (not shipped yet):
 *   { code: 'ar', name: 'العربية', dir: 'rtl' }
 *   { code: 'he', name: 'עברית', dir: 'rtl' }
 */
export type TextDirection = 'ltr' | 'rtl'

export type LocaleMeta = {
  code: string
  name: string
  dir: TextDirection
}

export const LOCALES: readonly LocaleMeta[] = [
  { code: 'en', name: 'English', dir: 'ltr' },
] as const

export const DEFAULT_LOCALE = 'en'
export const LOCALE_STORAGE_KEY = 'docket.locale'

const byCode = new Map(LOCALES.map((locale) => [locale.code, locale]))

export function isSupportedLocale(code: string): boolean {
  return byCode.has(code)
}

export function getLocaleMeta(code: string): LocaleMeta {
  return byCode.get(code) ?? byCode.get(DEFAULT_LOCALE)!
}

/** Normalize BCP-47 tags (e.g. `en-US` → `en`) to a registered locale code. */
export function resolveLocaleCode(tag: string | null | undefined): string {
  if (!tag) return DEFAULT_LOCALE
  const normalized = tag.trim().toLowerCase()
  if (isSupportedLocale(normalized)) return normalized
  const base = normalized.split('-')[0]
  if (base && isSupportedLocale(base)) return base
  return DEFAULT_LOCALE
}
