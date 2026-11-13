import type { TaskEvent } from '../../api'
import { Section } from '../../components/Section'
import { formatDateTime, formatRelative, humanize, statusLabel } from '../../lib/format'

const FIELD_LABELS: Record<string, string> = {
  body: 'notes',
  due_at: 'deadline',
  parent_task_id: 'parent',
}

type Payload = Record<string, unknown>

function parsePayload(raw: string | null): Payload | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    return value && typeof value === 'object' ? (value as Payload) : null
  } catch {
    return null
  }
}

function quoted(value: unknown) {
  return typeof value === 'string' && value ? ` “${value}”` : ''
}

function leaseSeconds(payload: Payload | null) {
  const seconds = payload?.lease_seconds
  return typeof seconds === 'number' ? ` (${seconds}s lease)` : ''
}

function describe(event: TaskEvent, payload: Payload | null) {
  switch (event.type) {
    case 'created':
      return 'created this task'
    case 'status_changed':
      return payload?.to
        ? `changed status${payload.from ? ` from ${statusLabel(String(payload.from))}` : ''} to ${statusLabel(String(payload.to))}`
        : 'changed status'
    case 'updated': {
      const fields = Object.keys(payload ?? {}).map((k) => FIELD_LABELS[k] ?? humanize(k).toLowerCase())
      return fields.length ? `updated ${fields.join(', ')}` : 'updated this task'
    }
    case 'artifact_added':
      return `attached${quoted(payload?.title)}`
    case 'artifact_deleted':
      return `removed artifact${quoted(payload?.title)}`
    case 'linked':
    case 'unlinked': {
      const verb = event.type === 'linked' ? 'linked' : 'unlinked'
      if (!payload?.from_task_id || !payload.to_task_id) return verb
      const raw = String(payload.kind ?? 'related')
      const kind = raw === 'related' ? 'related to' : humanize(raw).toLowerCase()
      return `${verb} #${String(payload.from_task_id)} ${kind} #${String(payload.to_task_id)}`
    }
    case 'shared':
      return `shared with${quoted(payload?.email)}`
    case 'unshared':
      return `stopped sharing with${quoted(payload?.email)}`
    case 'claimed':
      return `claimed this task${leaseSeconds(payload)}`
    case 'claim_renewed':
      return `renewed the claim${leaseSeconds(payload)}`
    case 'released':
      return 'released the claim'
    case 'claim_failed':
    case 'release_failed':
    case 'heartbeat_failed':
      return payload?.error
        ? `failed to ${String(payload.operation ?? 'operate')}: ${String(payload.error)}`
        : humanize(event.type).toLowerCase()
    default:
      return humanize(event.type).toLowerCase()
  }
}

function ActorDrillDown({ event, actorLabel }: { event: TaskEvent; actorLabel: string }) {
  const rows: Array<[string, string]> = [['User', actorLabel]]
  if (event.actor_token_id != null) {
    rows.push(['Token', event.actor_token_name ? `token:${event.actor_token_name}` : `#${event.actor_token_id}`])
    rows.push(['Token id', String(event.actor_token_id)])
  }
  if (event.actor_role_name) {
    rows.push(['Role', event.actor_role_name])
  } else if (event.actor_token_id != null) {
    rows.push(['Role', 'full user permissions'])
  } else {
    rows.push(['Role', 'session'])
  }

  return (
    <details className="actor-drilldown">
      <summary>Actor</summary>
      <dl className="actor-meta">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

type Props = {
  events: TaskEvent[]
  actorName: (event: TaskEvent) => string
  actorUserLabel: (event: TaskEvent) => string
}

export function ActivitySection({ events, actorName, actorUserLabel }: Props) {
  const ordered = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)

  return (
    <Section icon="activity" title="Activity" count={events.length}>
      {ordered.length === 0 ? (
        <p className="muted small">No activity yet.</p>
      ) : (
        <ol className="timeline">
          {ordered.map((ev) => {
            const payload = parsePayload(ev.payload_json)
            return (
              <li key={ev.id} className={`event event-${ev.type}`}>
                <span className="event-dot" aria-hidden="true" />
                <div className="event-body">
                  <p>
                    <strong>{actorName(ev)}</strong> {describe(ev, payload)}
                    <span className="muted small" title={formatDateTime(ev.created_at)}>
                      {' · '}
                      {formatRelative(ev.created_at)}
                    </span>
                  </p>
                  <ActorDrillDown event={ev} actorLabel={actorUserLabel(ev)} />
                  {ev.payload_json && (
                    <details>
                      <summary>Details</summary>
                      <pre>{payload ? JSON.stringify(payload, null, 2) : ev.payload_json}</pre>
                    </details>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Section>
  )
}
