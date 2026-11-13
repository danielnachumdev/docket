import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { api, type InvitePreview } from '../api'
import { Logo } from '../components/AppLayout'
import { Alert, Skeleton } from '../components/Feedback'
import { useAction } from '../lib/useAction'

export function RegisterPage() {
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
      setLoadError('Missing invite token.')
      return
    }
    void api
      .previewInvite(token)
      .then((body) => {
        setPreview(body)
        if (body.email) setEmail(body.email)
      })
      .catch((err: Error) => setLoadError(err.message))
  }, [token])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    void run(async () => {
      const user = await api.register({
        token,
        email,
        display_name: displayName || email.split('@')[0] || 'Member',
        password,
      })
      setUser(user)
      await refresh()
      navigate('/', { replace: true })
    }, 'Could not register')
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <Logo />
          <h1>Join Docket</h1>
          <p className="muted">Create your account with this invite link.</p>
        </div>

        {loadError && <Alert>{loadError}</Alert>}
        {(error) && <Alert>{error}</Alert>}

        {!loadError && !preview && <Skeleton rows={4} />}

        {preview && (
          <form className="stack" onSubmit={onSubmit}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="username"
                autoFocus={!preview.email_bound}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={preview.email_bound}
                placeholder="you@example.com"
              />
            </label>
            <label className="field">
              <span>Display name</span>
              <input
                type="text"
                autoFocus={preview.email_bound}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How should we call you?"
                required
                maxLength={200}
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 12 characters, letter + digit"
              />
            </label>
            <button type="submit" className="btn primary block" disabled={busy}>
              {busy ? 'Working…' : 'Create account'}
            </button>
          </form>
        )}

        <p className="muted small" style={{ marginTop: '1rem' }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </main>
  )
}
