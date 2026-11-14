import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { api, type InvitePreview } from '../api'
import { Logo } from '../components/AppLayout'
import { Alert, Skeleton } from '../components/Feedback'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useAction } from '../lib/useAction'

export function RegisterPage() {
  const { t } = useTranslation(['auth', 'common'])
  const [params] = useSearchParams()
  const token = params.get('token')?.trim() ?? ''
  const navigate = useNavigate()
  const { setUser, refresh } = useAuth()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, run } = useAction()

  useEffect(() => {
    if (!token) {
      setLoadError(t('auth:missingInviteToken'))
      return
    }
    void api
      .previewInvite(token)
      .then((body) => {
        setPreview(body)
        if (body.email) setEmail(body.email)
      })
      .catch((err: Error) => setLoadError(err.message))
  }, [token, t])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    void run(async () => {
      const user = await api.register({
        token,
        email,
        display_name: displayName || email.split('@')[0] || t('auth:defaultMemberName'),
        password,
      })
      setUser(user)
      await refresh()
      navigate('/', { replace: true })
    }, t('auth:registerFailed'))
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <Logo />
          <h1>{t('auth:joinTitle')}</h1>
          <p className="muted">{t('auth:joinSubtitle')}</p>
        </div>

        {loadError && <Alert>{loadError}</Alert>}
        {error && <Alert>{error}</Alert>}

        {!loadError && !preview && <Skeleton rows={4} />}

        {preview && (
          <form className="stack" onSubmit={onSubmit}>
            <label className="field">
              <span>{t('auth:email')}</span>
              <input
                type="email"
                autoComplete="username"
                autoFocus={!preview.email_bound}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={preview.email_bound}
                placeholder={t('auth:emailPlaceholder')}
              />
            </label>
            <label className="field">
              <span>{t('auth:displayName')}</span>
              <input
                type="text"
                autoFocus={preview.email_bound}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('auth:displayNamePlaceholder')}
                required
                maxLength={200}
              />
            </label>
            <label className="field">
              <span>{t('auth:password')}</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth:passwordPlaceholderNew')}
              />
            </label>
            <button type="submit" className="btn primary block" disabled={busy}>
              {busy ? t('common:working') : t('auth:createAccount')}
            </button>
          </form>
        )}

        <p className="muted small" style={{ marginTop: '1rem' }}>
          {t('auth:alreadyHaveAccount')} <Link to="/login">{t('auth:signIn')}</Link>
        </p>

        <div className="auth-lang">
          <LanguageSwitcher />
        </div>
      </div>
    </main>
  )
}
