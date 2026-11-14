import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Webhook } from '../api'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { SecretReveal } from '../components/SecretReveal'
import { useConfirm } from '../lib/dialogs'
import { formatDateTime, formatRelative, humanize } from '../lib/format'
import { useAction } from '../lib/useAction'

const EVENT_TYPES = ['status_changed', 'claimed', 'released', 'commented'] as const

export function WebhooksPage() {
  const { t } = useTranslation(['integrations', 'common'])
  const confirm = useConfirm()
  const [hooks, setHooks] = useState<Webhook[] | null>(null)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [eventTypes, setEventTypes] = useState<string[]>([...EVENT_TYPES])
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const { busy, error, setError, run } = useAction()

  const load = useCallback(async () => {
    setHooks(await api.listWebhooks())
  }, [])

  useEffect(() => {
    load().catch((err: Error) => setError(err.message))
  }, [load, setError])

  const eventLabel = (id: string) =>
    t(`webhooks.event.${id}`, { defaultValue: humanize(id) })

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
    }, t('webhooks.createFailed'))
  }

  function onToggle(hook: Webhook) {
    void run(async () => {
      await api.updateWebhook(hook.id, { enabled: !hook.enabled })
      await load()
    }, t('webhooks.updateFailed'))
  }

  async function onDelete(hook: Webhook) {
    const ok = await confirm({
      title: t('webhooks.deleteTitle'),
      description: t('webhooks.deleteBody', { name: hook.name }),
      confirmLabel: t('common:delete'),
      danger: true,
    })
    if (!ok) return
    void run(async () => {
      await api.deleteWebhook(hook.id)
      await load()
    }, t('webhooks.deleteFailed'))
  }

  return (
    <main className="page narrow">
      <PageHeader title={t('webhooks.title')} subtitle={t('webhooks.subtitle')} />

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {createdSecret && (
        <SecretReveal
          icon="key"
          title={t('webhooks.revealTitle')}
          secret={createdSecret}
          onDismiss={() => setCreatedSecret(null)}
        >
          {t('webhooks.revealHint')}
        </SecretReveal>
      )}

      <form className="card stack" onSubmit={onCreate}>
        <div className="token-form">
          <label className="field grow">
            <span>{t('webhooks.name')}</span>
            <input
              type="text"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('webhooks.namePlaceholder')}
              required
              maxLength={120}
            />
          </label>
          <label className="field grow">
            <span>{t('webhooks.url')}</span>
            <input
              type="url"
              name="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('webhooks.urlPlaceholder')}
              required
            />
          </label>
        </div>
        <fieldset className="field">
          <legend>{t('webhooks.events')}</legend>
          <div className="chip-row">
            {EVENT_TYPES.map((id) => (
              <label key={id} className="chip-toggle">
                <input
                  type="checkbox"
                  checked={eventTypes.includes(id)}
                  onChange={() => toggleEvent(id)}
                />
                <span>{eventLabel(id)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="actions end">
          <button
            type="submit"
            className="btn primary"
            disabled={busy || eventTypes.length === 0}
          >
            <Icon name="plus" />
            {t('webhooks.add')}
          </button>
        </div>
      </form>

      <div className="section-head">
        <h2>{t('webhooks.listTitle')}</h2>
      </div>

      {hooks == null ? (
        <Skeleton rows={3} />
      ) : hooks.length === 0 ? (
        <EmptyState icon="webhook" title={t('webhooks.emptyTitle')}>
          {t('webhooks.emptyHint')}
        </EmptyState>
      ) : (
        <ul className="card list">
          {hooks.map((hook) => (
            <li key={hook.id} className={hook.enabled ? 'list-row' : 'list-row revoked'}>
              <span className="artifact-icon">
                <Icon name="webhook" />
              </span>
              <span className="grow min-0">
                <strong className="block truncate">
                  {hook.name}
                  {!hook.enabled && <span className="tag inline-tag">{t('webhooks.disabled')}</span>}
                </strong>
                <span className="muted small block truncate mono">{hook.url}</span>
                <span className="muted small meta-line">
                  <span>{hook.event_types.map(eventLabel).join(', ')}</span>
                  <span title={formatDateTime(hook.created_at)}>
                    {t('created', { when: formatRelative(hook.created_at) })}
                  </span>
                  <span title={formatDateTime(hook.last_delivered_at)}>
                    {hook.last_delivered_at
                      ? hook.last_status_code != null
                        ? t('webhooks.lastDeliveryStatus', {
                            when: formatRelative(hook.last_delivered_at),
                            code: hook.last_status_code,
                          })
                        : t('webhooks.lastDelivery', { when: formatRelative(hook.last_delivered_at) })
                      : t('webhooks.neverDelivered')}
                  </span>
                  {hook.last_error && (
                    <span className="danger-text">
                      {t('webhooks.error', { message: hook.last_error })}
                    </span>
                  )}
                </span>
              </span>
              <span className="row-actions">
                <button
                  type="button"
                  className="btn ghost small"
                  disabled={busy}
                  onClick={() => onToggle(hook)}
                >
                  {hook.enabled ? t('common:disable') : t('common:enable')}
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  disabled={busy}
                  aria-label={t('common:delete')}
                  title={t('common:delete')}
                  onClick={() => void onDelete(hook)}
                >
                  <Icon name="trash" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
