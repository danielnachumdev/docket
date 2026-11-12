import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type ApiToken, type Role } from '../api'

function formatWhen(value: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString()
}

export function TokensPage() {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [name, setName] = useState('')
  const [roleId, setRoleId] = useState<string>('')
  const [includeRevoked, setIncludeRevoked] = useState(false)
  const [createdRaw, setCreatedRaw] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    const [tokenRows, roleRows] = await Promise.all([
      api.listTokens(includeRevoked),
      api.listAssignableRoles(),
    ])
    setTokens(tokenRows)
    setRoles(roleRows)
  }, [includeRevoked])

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message))
  }, [load])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    setCreatedRaw(null)
    try {
      const created = await api.createToken({
        name: name.trim(),
        role_id: roleId === '' ? null : Number(roleId),
      })
      setName('')
      setRoleId('')
      setCreatedRaw(created.token)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  async function onRevoke(id: number) {
    setBusy(true)
    setError(null)
    try {
      await api.revokeToken(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revoke failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="shell">
      <p className="crumb">
        <Link to="/">← Tasks</Link>
      </p>
      <div className="row-between">
        <h2>API tokens</h2>
        <label className="toggle">
          <input
            type="checkbox"
            checked={includeRevoked}
            onChange={(e) => setIncludeRevoked(e.target.checked)}
          />
          Show revoked
        </label>
      </div>
      <p className="muted small">
        Mint a bearer token for an external agent. The raw secret is shown once at creation.
      </p>

      {error && <p className="err">{error}</p>}

      {createdRaw && (
        <div className="panel">
          <h3>Copy this token now</h3>
          <p className="muted small">It will not be shown again.</p>
          <code className="payload token-secret">{createdRaw}</code>
          <div className="actions" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="ghost" onClick={() => setCreatedRaw(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <form className="panel form" onSubmit={(e) => void onCreate(e)}>
        <div className="form-row">
          <label>
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Instinct"
              required
              maxLength={120}
            />
          </label>
          <label>
            Downscope role (optional)
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              aria-label="Downscope role"
            >
              <option value="">Full user permissions</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            Create token
          </button>
        </div>
      </form>

      <ul className="plain token-list">
        {tokens.map((token) => {
          const revoked = token.revoked_at != null
          return (
            <li key={token.id} className="panel token-row">
              <div className="row-between" style={{ marginBottom: 0 }}>
                <div>
                  <strong>{token.name}</strong>
                  <div className="muted small">
                    {token.role_name ? `role ${token.role_name}` : 'no downscope'}
                    {' · '}
                    created {formatWhen(token.created_at)}
                    {token.last_used_at && ` · last used ${formatWhen(token.last_used_at)}`}
                  </div>
                </div>
                <div className="actions">
                  {revoked ? (
                    <span className="badge">revoked</span>
                  ) : (
                    <button
                      type="button"
                      className="danger"
                      disabled={busy}
                      onClick={() => void onRevoke(token.id)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
        {tokens.length === 0 && <li className="muted empty">No tokens yet.</li>}
      </ul>
    </main>
  )
}
