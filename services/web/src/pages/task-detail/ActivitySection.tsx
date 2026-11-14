import { useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { TaskEvent } from '../../api'
import { Icon } from '../../components/Icon'
import { Section } from '../../components/Section'
import { formatDateTime, formatRelative, humanize, statusLabel } from '../../lib/format'

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

function text(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

function leaseSeconds(payload: Payload | null) {
  const seconds = payload?.lease_seconds
  return typeof seconds === 'number' ? seconds : null
}

function describe(t: TFunction, event: TaskEvent, payload: Payload | null) {
  const e = (key: string, values: Record<string, string | number> = {}) =>
    t(`activity.event.${key}`, values)
  switch (event.type) {
    case 'created':
      return e('created')
    case 'status_changed': {
      if (!payload?.to) return e('statusChanged')
      const to = statusLabel(String(payload.to))
      return payload.from
        ? e('statusChangedFromTo', { from: statusLabel(String(payload.from)), to })
        : e('statusChangedTo', { to })
    }
    case 'updated': {
      const fields = Object.keys(payload ?? {}).map((k) =>
        t(`activity.field.${k}`, { defaultValue: humanize(k).toLowerCase() }),
      )
      return fields.length ? e('updatedFields', { fields: fields.join(', ') }) : e('updated')
    }
    case 'artifact_added': {
      const title = text(payload?.title)
      return title ? e('artifactAdded', { title }) : e('artifactAddedPlain')
    }
    case 'artifact_deleted': {
      const title = text(payload?.title)
      return title ? e('artifactDeleted', { title }) : e('artifactDeletedPlain')
    }
    case 'linked':
    case 'unlinked': {
      const key = event.type
      if (!payload?.from_task_id || !payload.to_task_id) return e(`${key}Plain`)
      const raw = String(payload.kind ?? 'related')
      return e(key, {
        from: String(payload.from_task_id),
        to: String(payload.to_task_id),
        kind: t(`activity.event.linkKind.${raw}`, { defaultValue: humanize(raw).toLowerCase() }),
      })
    }
    case 'shared': {
      const email = text(payload?.email)
      return email ? e('shared', { email }) : e('sharedPlain')
    }
    case 'unshared': {
      const email = text(payload?.email)
      return email ? e('unshared', { email }) : e('unsharedPlain')
    }
    case 'claimed': {
      const seconds = leaseSeconds(payload)
      return seconds != null ? e('claimedLease', { seconds }) : e('claimed')
    }
    case 'claim_renewed': {
      const seconds = leaseSeconds(payload)
      return seconds != null ? e('claimRenewedLease', { seconds }) : e('claimRenewed')
    }
    case 'released':
      return e('released')
    case 'claim_failed':
    case 'release_failed':
    case 'heartbeat_failed':
      return payload?.error
        ? e('failed', {
            operation: String(payload.operation ?? humanize(event.type.replace(/_failed$/, ''))),
            error: String(payload.error),
          })
        : humanize(event.type).toLowerCase()
    case 'commented': {
      const body = text(payload?.body)
      return body ? e('commented', { body }) : e('commentedPlain')
    }
    default:
      return humanize(event.type).toLowerCase()
  }
}

function ActorDrillDown({ event, actorLabel }: { event: TaskEvent; actorLabel: string }) {
  const { t } = useTranslation('detail')
  const rows: Array<[string, string]> = [[t('activity.row.user'), actorLabel]]
  if (event.actor_token_id != null) {
    rows.push([
      t('activity.row.token'),
      event.actor_token_name ? `token:${event.actor_token_name}` : `#${event.actor_token_id}`,
    ])
    rows.push([t('activity.row.tokenId'), String(event.actor_token_id)])
  }
  if (event.actor_role_name) {
    rows.push([t('activity.row.role'), event.actor_role_name])
  } else if (event.actor_token_id != null) {
    rows.push([t('activity.row.role'), t('activity.roleFull')])
  } else {
    rows.push([t('activity.row.role'), t('activity.roleSession')])
  }

  return (
    <details className="actor-drilldown">
      <summary>{t('activity.actor')}</summary>
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

const EXPANDED_SESSION_KEY = 'docket.activitySectionExpanded'

function readExpandedPreference(): boolean {
  try {
    return sessionStorage.getItem(EXPANDED_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function writeExpandedPreference(expanded: boolean) {
  try {
    sessionStorage.setItem(EXPANDED_SESSION_KEY, expanded ? '1' : '0')
  } catch {
    /* ignore quota / private mode */
  }
}

export function ActivitySection({ events, actorName, actorUserLabel }: Props) {
  const { t } = useTranslation('detail')
  const [expanded, setExpanded] = useState(readExpandedPreference)
  const ordered = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)

  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev
      writeExpandedPreference(next)
      return next
    })
  }

  return (
    <Section
      icon="activity"
      title={t('activity.title')}
      count={events.length}
      action={
        <button
          type="button"
          className="icon-btn ghost expand"
          aria-label={expanded ? t('activity.collapse') : t('activity.expand')}
          aria-expanded={expanded}
          onClick={toggleExpanded}
        >
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} />
        </button>
      }
    >
      {expanded &&
        (ordered.length === 0 ? (
          <p className="muted small activity-empty">{t('activity.empty')}</p>
        ) : (
          <div className="activity-scroll">
            <ol className="timeline activity-timeline">
              {ordered.map((ev) => {
                const payload = parsePayload(ev.payload_json)
                return (
                  <li key={ev.id} className={`event event-${ev.type}`}>
                    <span className="event-dot" aria-hidden="true" />
                    <div className="event-body">
                      <p>
                        <strong>{actorName(ev)}</strong> {describe(t, ev, payload)}
                        <span className="muted small" title={formatDateTime(ev.created_at)}>
                          {' · '}
                          {formatRelative(ev.created_at)}
                        </span>
                      </p>
                      <div className="event-details">
                        <ActorDrillDown event={ev} actorLabel={actorUserLabel(ev)} />
                        {ev.payload_json && (
                          <details>
                            <summary>{t('activity.payload')}</summary>
                            <pre>{payload ? JSON.stringify(payload, null, 2) : ev.payload_json}</pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
    </Section>
  )
}
