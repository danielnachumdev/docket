import { useState, type FormEvent } from 'react'
import { api, type TaskShare } from '../../api'
import { Alert } from '../../components/Feedback'
import { Icon } from '../../components/Icon'
import { Section } from '../../components/Section'
import { initials } from '../../lib/format'
import { useAction } from '../../lib/useAction'

type Props = {
  taskId: number
  shares: TaskShare[]
  isOwner: boolean
  onChanged: () => Promise<void>
}

export function SharingSection({ taskId, shares, isOwner, onChanged }: Props) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer')
  const { busy, error, setError, run } = useAction()

  function onShare(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    void run(async () => {
      await api.shareTask(taskId, { email: email.trim().toLowerCase(), role })
      setEmail('')
      await onChanged()
    }, 'Could not share task')
  }

  return (
    <Section icon="users" title="Sharing" count={shares.length}>
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {shares.length === 0 ? (
        <p className="muted small">Only you can see this task.</p>
      ) : (
        <ul className="list">
          {shares.map((s) => (
            <li key={s.id} className="list-row">
              <span className="avatar small">{initials(s.display_name)}</span>
              <span className="grow min-0">
                <span className="block truncate">{s.display_name}</span>
                {s.email && <span className="muted small block truncate">{s.email}</span>}
              </span>
              <span className={`role-tag role-${s.role}`}>{s.role}</span>
              {isOwner && (
                <button
                  type="button"
                  className="icon-btn"
                  disabled={busy}
                  aria-label={`Stop sharing with ${s.display_name}`}
                  title="Stop sharing"
                  onClick={() =>
                    void run(async () => {
                      await api.unshareTask(taskId, s.id)
                      await onChanged()
                    }, 'Could not unshare')
                  }
                >
                  <Icon name="x" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isOwner && (
        <form className="stack tight" onSubmit={onShare}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@example.com"
            aria-label="Email to share with"
            required
          />
          <div className="inline-form">
            <select
              className="grow"
              value={role}
              onChange={(e) => setRole(e.target.value as 'viewer' | 'editor')}
              aria-label="Share role"
            >
              <option value="viewer">Can view</option>
              <option value="editor">Can edit</option>
            </select>
            <button type="submit" className="btn" disabled={busy || !email.trim()}>
              <Icon name="users" />
              Share
            </button>
          </div>
        </form>
      )}
    </Section>
  )
}
