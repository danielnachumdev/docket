import {
  DEFAULT_LOCALE,
  getLocaleMeta,
  resolveLocaleCode,
  type LocaleMeta,
} from './locales'

export function applyDocumentLocale(code: string): LocaleMeta {
  const resolved = resolveLocaleCode(code) || DEFAULT_LOCALE
  const meta = getLocaleMeta(resolved)
  const root = document.documentElement
  root.lang = meta.code
  root.dir = meta.dir
  return meta
}
