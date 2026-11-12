import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'

export function LoginPage() {
  const { status, bootstrap, login, error: authError } = useAuth()
  const needsBootstrap = status !== null && !status.bootstrapped
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (needsBootstrap) {
        await bootstrap({
          email,
          display_name: displayName || email.split('@')[0] || 'Owner',
          password,
        })
      } else {
        await login({ email, password })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="shell narrow">
      <h1>Docket</h1>
      <p className="tagline">
        {needsBootstrap
          ? 'Create the first owner account to start.'
          : 'Sign in to manage tasks.'}
      </p>
      {(error || authError) && <p className="err">{error || authError}</p>}
      <form className="panel form" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {needsBootstrap && (
          <label>
            Display name
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="You"
            />
          </label>
        )}
        <label>
          Password
          <input
            type="password"
            autoComplete={needsBootstrap ? 'new-password' : 'current-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Working…' : needsBootstrap ? 'Create owner' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
