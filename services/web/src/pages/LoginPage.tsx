import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { Logo } from '../components/AppLayout'
import { Alert } from '../components/Feedback'
import { useAction } from '../lib/useAction'

export function LoginPage() {
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
              display_name: displayName || email.split('@')[0] || 'Owner',
              password,
            })
          : login({ email, password }),
      needsBootstrap ? 'Could not create account' : 'Sign in failed',
    )
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <Logo />
          <h1>{needsBootstrap ? 'Welcome to Docket' : 'Sign in to Docket'}</h1>
          <p className="muted">
            {needsBootstrap
              ? 'Create the first owner account to get started.'
              : 'Your task system of record — for you and your agents.'}
          </p>
        </div>

        {(error || authError) && <Alert>{error || authError}</Alert>}

        <form className="stack" onSubmit={onSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          {needsBootstrap && (
            <label className="field">
              <span>Display name</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How should we call you?"
              />
            </label>
          )}
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={needsBootstrap ? 'new-password' : 'current-password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </label>
          <button type="submit" className="btn primary block" disabled={busy}>
            {busy ? 'Working…' : needsBootstrap ? 'Create owner account' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}
