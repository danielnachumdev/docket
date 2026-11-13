import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, type RegistrationInvite } from '../api'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { formatDateTime, formatRelative } from '../lib/format'
import { useAction } from '../lib/useAction'

function InviteReveal({
  path,
  onDismiss,
}: {
  path: string
  onDismiss: () => void
}) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}${path}`

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="card reveal">
      <header className="card-header">
        <h2>
          <Icon name="users" />
          Copy invite link
        </h2>
        <button type="button" className="icon-btn" aria-label="Dismiss" onClick={onDismiss}>
          <Icon name="x" />
        </button>
      </header>
      <p className="muted small">
        This link is single-use and expires in 7 days. The secret is shown only once.
      </p>
      <div className="secret">
        <code>{url}</code>
        <button type="button" className="btn small" onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'copy'} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </section>
  )
}

export function InvitesPage() {
  const [invites, setInvites] = useState<RegistrationInvite[] | null>(null)
  const [email, setEmail] = useState('')
  const [createdPath, setCreatedPath] = useState<string | null>(null)
  const { busy, error, setError, run } = useAction()

  const load = useCallback(async () => {
    setInvites(await api.listInvites())
  }, [])

  useEffect(() => {
    load().catch((err: Error) => setError(err.message))
  }, [load, setError])

  function onCreate(e: FormEvent) {
    e.preventDefault()
    setCreatedPath(null)
    void run(async () => {
      const created = await api.createInvite({
        email: email.trim() ? email.trim() : null,
      })
      setEmail('')
      setCreatedPath(created.register_path)
      await load()
    }, 'Could not create invite')
  }

  function onRevoke(invite: RegistrationInvite) {
    if (!window.confirm('Revoke this unused invite?')) return
    void run(async () => {
      await api.revokeInvite(invite.id)
      await load()
    }, 'Could not revoke invite')
  }

  return (
    <main className="page narrow">
      <header className="page-header">
        <div>
          <h1>Invites</h1>
          <p className="muted">
            Create single-use registration links. Public signup stays closed.
          </p>
        </div>
      </header>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {createdPath && (
        <InviteReveal path={createdPath} onDismiss={() => setCreatedPath(null)} />
      )}

      <form className="card token-form" onSubmit={onCreate}>
        <label className="field grow">
          <span>Optional email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="invitee@example.com"
            maxLength={320}
          />
        </label>
        <button type="submit" className="btn primary" disabled={busy}>
          <Icon name="plus" />
          Create invite
        </button>
      </form>

      <div className="section-head">
        <h2>Invite history</h2>
      </div>

      {invites == null ? (
        <Skeleton rows={3} />
      ) : invites.length === 0 ? (
        <EmptyState icon="users" title="No invites yet">
          Create a link above to invite someone privately.
        </EmptyState>
      ) : (
        <ul className="card list token-list">
          {invites.map((invite) => {
            const consumed = invite.consumed_at != null
            const expired =
              !consumed && new Date(invite.expires_at).getTime() <= Date.now()
            return (
              <li
                key={invite.id}
                className={consumed || expired ? 'list-row revoked' : 'list-row'}
              >
                <span className="artifact-icon">
                  <Icon name="users" />
                </span>
                <span className="grow min-0">
                  <strong className="block truncate">
                    {invite.email ?? 'Open invite (any email)'}
                  </strong>
                  <span className="muted small token-meta">
                    <span title={formatDateTime(invite.created_at)}>
                      Created {formatRelative(invite.created_at)}
                    </span>
                    <span title={formatDateTime(invite.expires_at)}>
                      Expires {formatRelative(invite.expires_at)}
                    </span>
                    {consumed && (
                      <span title={formatDateTime(invite.consumed_at)}>
                        Used {formatRelative(invite.consumed_at)}
                      </span>
                    )}
                  </span>
                </span>
                {consumed ? (
                  <span className="tag">Used</span>
                ) : expired ? (
                  <span className="tag">Expired</span>
                ) : (
                  <button
                    type="button"
                    className="btn ghost small danger"
                    disabled={busy}
                    onClick={() => onRevoke(invite)}
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
