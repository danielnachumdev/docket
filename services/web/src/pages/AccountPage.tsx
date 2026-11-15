import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import { useAuth } from '../auth'
import { Alert } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { PageHeader } from '../components/PageHeader'
import { Section } from '../components/Section'
import { ThemeStudio } from '../components/ThemeStudio'
import { initials } from '../lib/format'
import { useToast } from '../lib/toast'
import { useAction } from '../lib/useAction'
import './AccountPage.css'

export function AccountPage() {
  const { t } = useTranslation(['auth', 'common'])
  const { status, setUser } = useAuth()
  const toast = useToast()
  const user = status?.user
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const { busy, error, setError, run } = useAction()

  useEffect(() => {
    if (user) setDisplayName(user.display_name)
  }, [user])

  if (!user) return null
  const current = user
  const unchanged = !displayName.trim() || displayName.trim() === current.display_name

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next = displayName.trim()
    if (!next || next === current.display_name) return
    void run(async () => {
      const updated = await api.updateMe({ display_name: next })
      setUser(updated)
      setDisplayName(updated.display_name)
      toast(t('auth:profileSaved'))
    }, t('auth:saveProfileFailed'))
  }

  return (
    <main className="page narrow">
      <PageHeader title={t('common:account')} subtitle={t('auth:accountSubtitle')} />

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      <Section icon="user" title={t('auth:profile')}>
        <form className="stack" onSubmit={onSubmit}>
          <div className="account-identity">
            <span className="avatar large" aria-hidden="true">
              {initials(displayName.trim() || current.display_name)}
            </span>
            <span className="user-meta">
              <strong>{displayName.trim() || current.display_name}</strong>
              {current.email && <span>{current.email}</span>}
            </span>
          </div>
          <label className="field">
            <span>{t('auth:displayName')}</span>
            <input
              type="text"
              autoComplete="name"
              required
              maxLength={200}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('auth:displayNamePlaceholder')}
            />
          </label>
          <label className="field">
            <span>{t('auth:email')}</span>
            <input type="email" value={current.email ?? ''} readOnly disabled />
            <span className="field-hint muted">{t('auth:emailReadOnly')}</span>
          </label>
          <div className="actions end">
            {!unchanged && (
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => setDisplayName(current.display_name)}
              >
                {t('common:cancel')}
              </button>
            )}
            <button type="submit" className="btn primary" disabled={busy || unchanged}>
              {busy ? t('common:saving') : t('common:save')}
            </button>
          </div>
        </form>
      </Section>

      <Section icon="sliders" title={t('auth:preferences')}>
        <div className="pref-row">
          <span className="pref-label">
            <Icon name="globe" />
            {t('common:language')}
          </span>
          <LanguageSwitcher />
        </div>
      </Section>

      <Section icon="palette" title={t('auth:themeStudio')}>
        <ThemeStudio />
      </Section>
    </main>
  )
}
