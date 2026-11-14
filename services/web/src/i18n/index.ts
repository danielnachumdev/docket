import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import auth from '../locales/en/auth.json'
import common from '../locales/en/common.json'
import domain from '../locales/en/domain.json'
import nav from '../locales/en/nav.json'
import tasks from '../locales/en/tasks.json'
import { applyDocumentLocale } from './applyDocumentLocale'
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  resolveLocaleCode,
} from './locales'

export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_STORAGE_KEY,
  getLocaleMeta,
  isSupportedLocale,
  resolveLocaleCode,
  type LocaleMeta,
  type TextDirection,
} from './locales'
export { applyDocumentLocale } from './applyDocumentLocale'

const en = { common, nav, auth, tasks, domain }

function detectInitialLocale(): string {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored) return resolveLocaleCode(stored)
  } catch {
    /* ignore quota / private mode */
  }
  return resolveLocaleCode(navigator.language)
}

void i18n.use(initReactI18next).init({
  resources: {
    en,
    // ar: { common: arCommon, nav: arNav, ... },  // RTL example
  },
  lng: detectInitialLocale(),
  fallbackLng: DEFAULT_LOCALE,
  defaultNS: 'common',
  ns: ['common', 'nav', 'auth', 'tasks', 'domain'],
  interpolation: { escapeValue: false },
  returnNull: false,
})

applyDocumentLocale(i18n.language)

i18n.on('languageChanged', (lng) => {
  applyDocumentLocale(lng)
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, resolveLocaleCode(lng))
  } catch {
    /* ignore */
  }
})

export default i18n
