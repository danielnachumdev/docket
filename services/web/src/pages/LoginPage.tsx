import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth'
import { Logo } from '../components/AppLayout'
import { Alert } from '../components/Feedback'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useAction } from '../lib/useAction'

export function LoginPage() {
  const { t } = useTranslation(['auth', 'common'])
  const { status, bootstrap, login, error: authError } = useAuth()
  const needsBootstrap = status !== null && !status.bootstrapped
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, run } = useAction()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void run(
      () =>
        needsBootstrap
          ? bootstrap({
              email,
              display_name: displayName || email.split('@')[0] || t('auth:defaultOwnerName'),
              password,
            })
          : login({ email, password }),
      needsBootstrap ? t('auth:bootstrapFailed') : t('auth:signInFailed'),
    )
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <Logo />
          <h1>{needsBootstrap ? t('auth:welcomeTitle') : t('auth:signInTitle')}</h1>
          <p className="muted">
            {needsBootstrap ? t('auth:welcomeSubtitle') : t('auth:signInSubtitle')}
          </p>
        </div>

        {(error || authError) && <Alert>{error || authError}</Alert>}

        <form className="stack" onSubmit={onSubmit}>
          <label className="field">
            <span>{t('auth:email')}</span>
            <input
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth:emailPlaceholder')}
            />
          </label>
          {needsBootstrap && (
            <label className="field">
              <span>{t('auth:displayName')}</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('auth:displayNamePlaceholder')}
              />
            </label>
          )}
          <label className="field">
            <span>{t('auth:password')}</span>
            <input
              type="password"
              autoComplete={needsBootstrap ? 'new-password' : 'current-password'}
              required
              minLength={needsBootstrap ? 12 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                needsBootstrap ? t('auth:passwordPlaceholderNew') : t('auth:passwordPlaceholderSignIn')
              }
            />
          </label>
          <button type="submit" className="btn primary block" disabled={busy}>
            {busy
              ? t('common:working')
              : needsBootstrap
                ? t('auth:createOwnerAccount')
                : t('auth:signIn')}
          </button>
        </form>

        <div className="auth-lang">
          <LanguageSwitcher />
        </div>
      </div>
    </main>
  )
}
