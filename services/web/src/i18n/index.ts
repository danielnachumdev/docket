import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import authEn from '../locales/en/auth.json'
import commonEn from '../locales/en/common.json'
import domainEn from '../locales/en/domain.json'
import navEn from '../locales/en/nav.json'
import tasksEn from '../locales/en/tasks.json'
import authHe from '../locales/he/auth.json'
import commonHe from '../locales/he/common.json'
import domainHe from '../locales/he/domain.json'
import navHe from '../locales/he/nav.json'
import tasksHe from '../locales/he/tasks.json'
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

const en = {
  common: commonEn,
  nav: navEn,
  auth: authEn,
  tasks: tasksEn,
  domain: domainEn,
}

const he = {
  common: commonHe,
  nav: navHe,
  auth: authHe,
  tasks: tasksHe,
  domain: domainHe,
}

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
    he,
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
