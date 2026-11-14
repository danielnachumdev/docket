import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import artifactsEn from '../locales/en/artifacts.json'
import authEn from '../locales/en/auth.json'
import commonEn from '../locales/en/common.json'
import detailEn from '../locales/en/detail.json'
import domainEn from '../locales/en/domain.json'
import inboxEn from '../locales/en/inbox.json'
import integrationsEn from '../locales/en/integrations.json'
import navEn from '../locales/en/nav.json'
import tasksEn from '../locales/en/tasks.json'
import artifactsHe from '../locales/he/artifacts.json'
import authHe from '../locales/he/auth.json'
import commonHe from '../locales/he/common.json'
import detailHe from '../locales/he/detail.json'
import domainHe from '../locales/he/domain.json'
import inboxHe from '../locales/he/inbox.json'
import integrationsHe from '../locales/he/integrations.json'
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
  detail: detailEn,
  artifacts: artifactsEn,
  inbox: inboxEn,
  integrations: integrationsEn,
}

const he = {
  common: commonHe,
  nav: navHe,
  auth: authHe,
  tasks: tasksHe,
  domain: domainHe,
  detail: detailHe,
  artifacts: artifactsHe,
  inbox: inboxHe,
  integrations: integrationsHe,
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
  ns: Object.keys(en),
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
