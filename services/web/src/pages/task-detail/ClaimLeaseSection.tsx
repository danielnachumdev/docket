import type { Task, TaskEvent } from '../../api'
import { Section } from '../../components/Section'
import { formatDateTime, formatRelative, parseDate } from '../../lib/format'

const CLAIM_EVENT_TYPES = new Set(['claimed', 'claim_renewed', 'released'])

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

function leaseActive(task: Task, nowMs: number) {
  if (task.claimed_by_token_id == null || !task.claim_expires_at) return false
  const expires = parseDate(task.claim_expires_at)
  return expires != null && expires.getTime() > nowMs
}

function describeClaimEvent(event: TaskEvent, payload: Payload | null) {
  const token =
    event.actor_token_name != null
      ? `token:${event.actor_token_name}`
      : event.actor_token_id != null
        ? `token #${event.actor_token_id}`
        : 'session'
  const role = event.actor_role_name ? ` · ${event.actor_role_name}` : ''
  const lease =
    typeof payload?.lease_seconds === 'number' ? ` · ${payload.lease_seconds}s` : ''
  switch (event.type) {
    case 'claimed':
      return `${token}${role} claimed${lease}`
    case 'claim_renewed':
      return `${token}${role} renewed${lease}`
    case 'released':
      return `${token}${role} released`
    default:
      return event.type
  }
}

type Props = {
  task: Task
  events: TaskEvent[]
}

export function ClaimLeaseSection({ task, events }: Props) {
  const nowMs = Date.now()
  const active = leaseActive(task, nowMs)
  const timeline = [...events]
    .filter((ev) => CLAIM_EVENT_TYPES.has(ev.type))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)

  return (
    <Section icon="key" title="Claim / lease" count={timeline.length}>
      <div className="claim-status">
        {active ? (
          <>
            <p>
              <strong>
                {task.claimed_by_token_name
                  ? `token:${task.claimed_by_token_name}`
                  : `token #${task.claimed_by_token_id}`}
              </strong>{' '}
              holds an active lease
            </p>
            {task.claim_expires_at && (
              <p className="muted small" title={formatDateTime(task.claim_expires_at)}>
                Expires {formatRelative(task.claim_expires_at)} · {formatDateTime(task.claim_expires_at)}
              </p>
            )}
          </>
        ) : task.claimed_by_token_id != null && task.claim_expires_at ? (
          <p className="muted small">
            Lease expired
            {task.claimed_by_token_name ? ` for token:${task.claimed_by_token_name}` : ''} ·{' '}
            {formatDateTime(task.claim_expires_at)}
          </p>
        ) : (
          <p className="muted small">No active claim.</p>
        )}
      </div>

      {timeline.length === 0 ? (
        <p className="muted small">No claim events yet.</p>
      ) : (
        <ol className="timeline claim-timeline">
          {timeline.map((ev) => {
            const payload = parsePayload(ev.payload_json)
            return (
              <li key={ev.id} className={`event event-${ev.type}`}>
                <span className="event-dot" aria-hidden="true" />
                <div className="event-body">
                  <p>
                    {describeClaimEvent(ev, payload)}
                    <span className="muted small" title={formatDateTime(ev.created_at)}>
                      {' · '}
                      {formatRelative(ev.created_at)}
                    </span>
                  </p>
                  {payload?.claim_expires_at != null && (
                    <p className="muted small">Until {formatDateTime(String(payload.claim_expires_at))}</p>
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
