import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, type Task, type TaskLink } from '../../api'
import { Alert } from '../../components/Feedback'
import { Icon } from '../../components/Icon'
import { Section } from '../../components/Section'
import { UserBidiText } from '../../components/UserBidiText'
import { isMixedBidi } from '../../lib/bidi'
import { humanize } from '../../lib/format'
import { useAction } from '../../lib/useAction'

const LINK_KINDS = ['blocks', 'related', 'duplicate_of'] as const
type LinkKind = (typeof LINK_KINDS)[number]

type Props = {
  taskId: string
  links: TaskLink[]
  tasksById: Map<string, Task>
  onChanged: () => Promise<void>
  variant?: 'card' | 'plain'
  /** Render as a disclosure; collapsed on first render when true. */
  defaultCollapsed?: boolean
}

export function LinksSection({ taskId, links, tasksById, onChanged, variant = 'card', defaultCollapsed }: Props) {
  const [kind, setKind] = useState<LinkKind>('related')
  const [target, setTarget] = useState('')
  const { t } = useTranslation('detail')
  const { busy, error, setError, run } = useAction()
  const choices = [...tasksById.values()]
    .filter((row) => row.id !== taskId)
    .sort((a, b) => a.title.localeCompare(b.title))

  function onAdd(e: FormEvent) {
    e.preventDefault()
    if (!target) return
    void run(async () => {
      await api.createLink(taskId, { to_task_id: target, kind })
      setTarget('')
      await onChanged()
    }, t('links.addFailed'))
  }

  return (
    <Section
      icon="link"
      title={t('links.title')}
      count={links.length}
      variant={variant}
      collapsible={defaultCollapsed != null}
      defaultCollapsed={defaultCollapsed}
    >
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {links.length > 0 && (
        <ul className="list">
          {links.map((link) => {
            const outgoing = link.from_task_id === taskId
            const otherId = outgoing ? link.to_task_id : link.from_task_id
            const label = t(`links.${outgoing ? 'outgoing' : 'incoming'}.${link.kind}`, {
              defaultValue: humanize(link.kind),
            })
            const other = tasksById.get(otherId)
            return (
              <li key={link.id} className="list-row">
                <span className={`link-kind kind-${link.kind}`}>{label}</span>
                <Link to={`/tasks/${otherId}`} className="grow truncate">
                  {other ? (
                    <UserBidiText text={other.title} />
                  ) : (
                    t('links.taskFallback', { id: otherId })
                  )}
                </Link>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={busy}
                  aria-label={t('links.remove')}
                  title={t('links.remove')}
                  onClick={() =>
                    void run(async () => {
                      await api.deleteLink(taskId, link.id)
                      await onChanged()
                    }, t('links.removeFailed'))
                  }
                >
                  <Icon name="x" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <form className="stack tight" onSubmit={onAdd}>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-label={t('links.targetLabel')}
          required
        >
          <option value="">{t('links.targetPlaceholder')}</option>
          {choices.map((row) => {
            const label = `#${row.number} · ${row.title}`
            return (
              <option key={row.id} value={row.id} dir={isMixedBidi(label) ? 'rtl' : undefined}>
                {label}
              </option>
            )
          })}
        </select>
        <div className="inline-form">
          <select
            className="grow"
            value={kind}
            onChange={(e) => setKind(e.target.value as LinkKind)}
            aria-label={t('links.kindLabel')}
          >
            {LINK_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`links.outgoing.${k}`)}
              </option>
            ))}
          </select>
          <button type="submit" className="btn" disabled={busy || !target}>
            <Icon name="link" />
            {t('links.add')}
          </button>
        </div>
      </form>
    </Section>
  )
}
