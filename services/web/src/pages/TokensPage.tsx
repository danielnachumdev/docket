import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, type ApiToken, type Role } from '../api'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { formatDateTime, formatRelative } from '../lib/format'
import { useAction } from '../lib/useAction'

function NewTokenReveal({ token, onDismiss }: { token: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(token)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="card reveal">
      <header className="card-header">
        <h2>
          <Icon name="key" />
          Copy your new token
        </h2>
        <button type="button" className="icon-btn" aria-label="Dismiss" onClick={onDismiss}>
          <Icon name="x" />
        </button>
      </header>
      <p className="muted small">For security, this secret is shown only once. Store it somewhere safe.</p>
      <div className="secret">
        <code>{token}</code>
        <button type="button" className="btn small" onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'copy'} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </section>
  )
}

export function TokensPage() {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [name, setName] = useState('')
  const [roleId, setRoleId] = useState('')
  const [includeRevoked, setIncludeRevoked] = useState(false)
  const [createdRaw, setCreatedRaw] = useState<string | null>(null)
  const { busy, error, setError, run } = useAction()

  const load = useCallback(async () => {
    const [tokenRows, roleRows] = await Promise.all([
      api.listTokens(includeRevoked),
      api.listAssignableRoles(),
    ])
    setTokens(tokenRows)
    setRoles(roleRows)
  }, [includeRevoked])

  useEffect(() => {
    load().catch((err: Error) => setError(err.message))
  }, [load, setError])

  function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setCreatedRaw(null)
    void run(async () => {
      const created = await api.createToken({
        name: name.trim(),
        role_id: roleId === '' ? null : Number(roleId),
      })
      setName('')
      setRoleId('')
      setCreatedRaw(created.token)
      await load()
    }, 'Could not create token')
  }

  function onRevoke(token: ApiToken) {
    if (!window.confirm(`Revoke “${token.name}”? Agents using it will lose access immediately.`)) return
    void run(async () => {
      await api.revokeToken(token.id)
      await load()
    }, 'Could not revoke token')
  }

  return (
    <main className="page narrow">
      <header className="page-header">
        <div>
          <h1>API tokens</h1>
          <p className="muted">Bearer tokens let external agents read and update tasks on your behalf.</p>
        </div>
      </header>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {createdRaw && <NewTokenReveal token={createdRaw} onDismiss={() => setCreatedRaw(null)} />}

      <form className="card token-form" onSubmit={onCreate}>
        <label className="field grow">
          <span>Token name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. demo-agent"
            required
            maxLength={120}
          />
        </label>
        <label className="field">
          <span>Permissions</span>
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">Full (same as you)</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
          <Icon name="plus" />
          Create token
        </button>
      </form>

      <div className="section-head">
        <h2>Your tokens</h2>
        <label className="switch">
          <input
            type="checkbox"
            checked={includeRevoked}
            onChange={(e) => setIncludeRevoked(e.target.checked)}
          />
          <span className="switch-track" aria-hidden="true" />
          Show revoked
        </label>
      </div>

      {tokens == null ? (
        <Skeleton rows={3} />
      ) : tokens.length === 0 ? (
        <EmptyState icon="key" title="No tokens yet">
          Create one above to connect an agent.
        </EmptyState>
      ) : (
        <ul className="card list token-list">
          {tokens.map((token) => {
            const revoked = token.revoked_at != null
            return (
              <li key={token.id} className={revoked ? 'list-row revoked' : 'list-row'}>
                <span className="artifact-icon">
                  <Icon name="key" />
                </span>
                <span className="grow min-0">
                  <strong className="block truncate">{token.name}</strong>
                  <span className="muted small token-meta">
                    <span>{token.role_name ? `Role: ${token.role_name}` : 'Full permissions'}</span>
                    <span title={formatDateTime(token.created_at)}>
                      Created {formatRelative(token.created_at)}
                    </span>
                    <span title={formatDateTime(token.last_used_at)}>
                      {token.last_used_at ? `Last used ${formatRelative(token.last_used_at)}` : 'Never used'}
                    </span>
                  </span>
                </span>
                {revoked ? (
                  <span className="tag">Revoked</span>
                ) : (
                  <button
                    type="button"
                    className="btn ghost small danger"
                    disabled={busy}
                    onClick={() => onRevoke(token)}
                  >
                    Revoke
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
