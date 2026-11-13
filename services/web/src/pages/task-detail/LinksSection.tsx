import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type Task, type TaskLink } from '../../api'
import { Alert } from '../../components/Feedback'
import { Icon } from '../../components/Icon'
import { Section } from '../../components/Section'
import { humanize } from '../../lib/format'
import { useAction } from '../../lib/useAction'

const LINK_KINDS = ['blocks', 'related', 'duplicate_of'] as const
type LinkKind = (typeof LINK_KINDS)[number]

const OUTGOING: Record<string, string> = {
  blocks: 'Blocks',
  related: 'Related to',
  duplicate_of: 'Duplicate of',
}

const INCOMING: Record<string, string> = {
  blocks: 'Blocked by',
  related: 'Related to',
  duplicate_of: 'Duplicated by',
}

type Props = {
  taskId: number
  links: TaskLink[]
  tasksById: Map<number, Task>
  onChanged: () => Promise<void>
}

export function LinksSection({ taskId, links, tasksById, onChanged }: Props) {
  const [kind, setKind] = useState<LinkKind>('related')
  const [target, setTarget] = useState('')
  const { busy, error, setError, run } = useAction()
  const choices = [...tasksById.values()]
    .filter((t) => t.id !== taskId)
    .sort((a, b) => a.title.localeCompare(b.title))

  function onAdd(e: FormEvent) {
    e.preventDefault()
    const toTaskId = Number(target)
    if (!toTaskId) return
    void run(async () => {
      await api.createLink(taskId, { to_task_id: toTaskId, kind })
      setTarget('')
      await onChanged()
    }, 'Could not link tasks')
  }

  return (
    <Section icon="link" title="Links" count={links.length}>
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {links.length > 0 && (
        <ul className="list">
          {links.map((link) => {
            const outgoing = link.from_task_id === taskId
            const otherId = outgoing ? link.to_task_id : link.from_task_id
            const label = (outgoing ? OUTGOING : INCOMING)[link.kind] ?? humanize(link.kind)
            const other = tasksById.get(otherId)
            return (
              <li key={link.id} className="list-row">
                <span className={`link-kind kind-${link.kind}`}>{label}</span>
                <Link to={`/tasks/${otherId}`} className="grow truncate">
                  {other ? other.title : `Task #${otherId}`}
                </Link>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={busy}
                  aria-label="Remove link"
                  title="Remove link"
                  onClick={() =>
                    void run(async () => {
                      await api.deleteLink(taskId, link.id)
                      await onChanged()
                    }, 'Could not remove link')
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
          aria-label="Task to link"
          required
        >
          <option value="">Link to a task…</option>
          {choices.map((t) => (
            <option key={t.id} value={t.id}>
              #{t.id} · {t.title}
            </option>
          ))}
        </select>
        <div className="inline-form">
          <select
            className="grow"
            value={kind}
            onChange={(e) => setKind(e.target.value as LinkKind)}
            aria-label="Link kind"
          >
            {LINK_KINDS.map((k) => (
              <option key={k} value={k}>
                {OUTGOING[k]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn" disabled={busy || !target}>
            <Icon name="link" />
            Add link
          </button>
        </div>
      </form>
    </Section>
  )
}
