import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import { useAuth } from '../auth'
import { Alert } from '../components/Feedback'
import { PageHeader } from '../components/PageHeader'
import { useAction } from '../lib/useAction'

export function AccountPage() {
  const { t } = useTranslation(['auth', 'common'])
  const { status, setUser } = useAuth()
  const user = status?.user
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [saved, setSaved] = useState(false)
  const { busy, error, setError, run } = useAction()

  useEffect(() => {
    if (user) setDisplayName(user.display_name)
  }, [user])

  if (!user) return null
  const current = user

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next = displayName.trim()
    if (!next || next === current.display_name) return
    setSaved(false)
    void run(async () => {
      const updated = await api.updateMe({ display_name: next })
      setUser(updated)
      setDisplayName(updated.display_name)
      setSaved(true)
    }, t('auth:saveProfileFailed'))
  }

  return (
    <main className="page narrow">
      <PageHeader title={t('common:account')} subtitle={t('auth:accountSubtitle')} />

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {saved && !error && (
        <Alert onDismiss={() => setSaved(false)}>{t('auth:profileSaved')}</Alert>
      )}

      <form className="stack account-form" onSubmit={onSubmit}>
        <label className="field">
          <span>{t('auth:displayName')}</span>
          <input
            type="text"
            autoComplete="name"
            required
            maxLength={200}
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value)
              setSaved(false)
            }}
            placeholder={t('auth:displayNamePlaceholder')}
          />
        </label>
        <label className="field">
          <span>{t('auth:email')}</span>
          <input type="email" value={current.email ?? ''} readOnly disabled />
          <span className="field-hint muted">{t('auth:emailReadOnly')}</span>
        </label>
        <button
          type="submit"
          className="btn primary"
          disabled={
            busy || !displayName.trim() || displayName.trim() === current.display_name
          }
        >
          {busy ? t('common:saving') : t('common:save')}
        </button>
      </form>
    </main>
  )
}