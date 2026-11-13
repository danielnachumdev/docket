import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, type Webhook } from '../api'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { formatDateTime, formatRelative } from '../lib/format'
import { useAction } from '../lib/useAction'

const EVENT_OPTIONS = [
  { id: 'status_changed', label: 'Status changes' },
  { id: 'claimed', label: 'Claims' },
  { id: 'released', label: 'Releases' },
  { id: 'commented', label: 'Comments' },
] as const

function NewSecretReveal({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(secret)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="card reveal">
      <header className="card-header">
        <h2>
          <Icon name="key" />
          Copy your webhook secret
        </h2>
        <button type="button" className="icon-btn" aria-label="Dismiss" onClick={onDismiss}>
          <Icon name="x" />
        </button>
      </header>
      <p className="muted small">
        Shown once. Bridges verify deliveries with the <code>X-Docket-Signature</code> header.
      </p>
      <div className="secret">
        <code>{secret}</code>
        <button type="button" className="btn small" onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'copy'} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </section>
  )
}

export function WebhooksPage() {
  const [hooks, setHooks] = useState<Webhook[] | null>(null)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [eventTypes, setEventTypes] = useState<string[]>(EVENT_OPTIONS.map((o) => o.id))
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const { busy, error, setError, run } = useAction()

  const load = useCallback(async () => {
    setHooks(await api.listWebhooks())
  }, [])

  useEffect(() => {
    load().catch((err: Error) => setError(err.message))
  }, [load, setError])

  function toggleEvent(id: string) {
    setEventTypes((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const nameVal = String(fd.get('name') || name).trim()
    const urlVal = String(fd.get('url') || url).trim()
    if (!nameVal || !urlVal || eventTypes.length === 0) return
    setCreatedSecret(null)
    void run(async () => {
      const created = await api.createWebhook({
        name: nameVal,
        url: urlVal,
        event_types: eventTypes,
      })
      setName('')
      setUrl('')
      setCreatedSecret(created.secret)
      await load()
    }, 'Could not create webhook')
  }

  function onToggle(hook: Webhook) {
    void run(async () => {
      await api.updateWebhook(hook.id, { enabled: !hook.enabled })
      await load()
    }, 'Could not update webhook')
  }

  function onDelete(hook: Webhook) {
    if (!window.confirm(`Delete webhook “${hook.name}”?`)) return
    void run(async () => {
      await api.deleteWebhook(hook.id)
      await load()
    }, 'Could not delete webhook')
  }

  return (
    <main className="page narrow">
      <header className="page-header">
        <div>
          <h1>Webhooks</h1>
          <p className="muted">
            Push status, claim, and comment events to Instinct, WhatsApp, or Slack bridges. AI stays
            external.
          </p>
        </div>
      </header>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {createdSecret && (
        <NewSecretReveal secret={createdSecret} onDismiss={() => setCreatedSecret(null)} />
      )}

      <form className="card token-form stack" onSubmit={onCreate}>
        <label className="field grow">
          <span>Name</span>
          <input
            type="text"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. demo-slack"
            required
            maxLength={120}
          />
        </label>
        <label className="field grow">
          <span>Endpoint URL</span>
          <input
            type="url"
            name="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.example.com/docket"
            required
          />
        </label>
        <fieldset className="field">
          <legend>Events</legend>
          <div className="chip-row">
            {EVENT_OPTIONS.map((opt) => (
              <label key={opt.id} className="chip-toggle">
                <input
                  type="checkbox"
                  checked={eventTypes.includes(opt.id)}
                  onChange={() => toggleEvent(opt.id)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="submit"
          className="btn primary"
          disabled={busy || eventTypes.length === 0}
        >
          <Icon name="plus" />
          Add webhook
        </button>
      </form>

      <div className="section-head">
        <h2>Your webhooks</h2>
      </div>

      {hooks == null ? (
        <Skeleton rows={3} />
      ) : hooks.length === 0 ? (
        <EmptyState icon="webhook" title="No webhooks yet">
          Add an HTTPS endpoint above to receive task events.
        </EmptyState>
      ) : (
        <ul className="card list token-list">
          {hooks.map((hook) => (
            <li key={hook.id} className={hook.enabled ? 'list-row' : 'list-row revoked'}>
              <span className="artifact-icon">
                <Icon name="webhook" />
              </span>
              <span className="grow min-0">
                <strong className="block truncate">{hook.name}</strong>
                <span className="muted small token-meta">
                  <span className="truncate">{hook.url}</span>
                  <span>{hook.event_types.join(', ')}</span>
                  <span title={formatDateTime(hook.created_at)}>
                    Created {formatRelative(hook.created_at)}
                  </span>
                  <span title={formatDateTime(hook.last_delivered_at)}>
                    {hook.last_delivered_at
                      ? `Last delivery ${formatRelative(hook.last_delivered_at)}${
                          hook.last_status_code != null ? ` · HTTP ${hook.last_status_code}` : ''
                        }`
                      : 'Never delivered'}
                  </span>
                  {hook.last_error && <span className="danger-text">Error: {hook.last_error}</span>}
                </span>
              </span>
              <span className="actions">
                <button
                  type="button"
                  className="btn ghost small"
                  disabled={busy}
                  onClick={() => onToggle(hook)}
                >
                  {hook.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  className="btn ghost small danger"
                  disabled={busy}
                  onClick={() => onDelete(hook)}
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
