import { useTranslation } from 'react-i18next'
import { LOCALES, resolveLocaleCode } from '../i18n'
import { usePreferences } from '../preferences'

type Props = {
  className?: string
}

export function LanguageSwitcher({ className }: Props) {
  const { t, i18n } = useTranslation('common')
  const { setLocale } = usePreferences()
  const current = resolveLocaleCode(i18n.resolvedLanguage ?? i18n.language)

  return (
    <label className={className ? `lang-switcher ${className}` : 'lang-switcher'}>
      <span className="sr-only">{t('language')}</span>
      <select
        className="compact-select lang-select"
        value={current}
        aria-label={t('language')}
        onChange={(e) => {
          setLocale(e.target.value)
        }}
      >
        {LOCALES.map((locale) => (
          <option key={locale.code} value={locale.code} lang={locale.code}>
            {locale.name}
          </option>
        ))}
      </select>
    </label>
  )
}
