import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
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

function tokenLabel(t: TFunction, name: string | null | undefined, id: number | null | undefined) {
  if (name != null) return t('claim.tokenNamed', { name })
  if (id != null) return t('claim.tokenId', { id })
  return t('claim.session')
}

function describeClaimEvent(t: TFunction, event: TaskEvent, payload: Payload | null) {
  const parts = [tokenLabel(t, event.actor_token_name, event.actor_token_id)]
  if (event.actor_role_name) parts.push(event.actor_role_name)
  const verb = t(`claim.event.${event.type}`, { defaultValue: event.type })
  const lease =
    event.type !== 'released' && typeof payload?.lease_seconds === 'number'
      ? ` · ${t('claim.leaseSeconds', { seconds: payload.lease_seconds })}`
      : ''
  return `${parts.join(' · ')} ${verb}${lease}`
}

type Props = {
  task: Task
  events: TaskEvent[]
}

export function ClaimLeaseSection({ task, events }: Props) {
  const { t } = useTranslation('detail')
  const nowMs = Date.now()
  const active = leaseActive(task, nowMs)
  const holder = tokenLabel(t, task.claimed_by_token_name, task.claimed_by_token_id)
  const timeline = [...events]
    .filter((ev) => CLAIM_EVENT_TYPES.has(ev.type))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)

  return (
    <Section icon="key" title={t('claim.title')} count={timeline.length}>
      <div className="claim-status">
        {active ? (
          <>
            <p>{t('claim.holds', { token: holder })}</p>
            {task.claim_expires_at && (
              <p className="muted small">
                {t('claim.expires', {
                  when: formatRelative(task.claim_expires_at),
                  at: formatDateTime(task.claim_expires_at),
                })}
              </p>
            )}
          </>
        ) : task.claimed_by_token_id != null && task.claim_expires_at ? (
          <p className="muted small">
            {task.claimed_by_token_name
              ? t('claim.expiredFor', { token: holder, at: formatDateTime(task.claim_expires_at) })
              : t('claim.expired', { at: formatDateTime(task.claim_expires_at) })}
          </p>
        ) : (
          <p className="muted small">{t('claim.none')}</p>
        )}
      </div>

      {timeline.length === 0 ? (
        <p className="muted small">{t('claim.noEvents')}</p>
      ) : (
        <ol className="timeline claim-timeline">
          {timeline.map((ev) => {
            const payload = parsePayload(ev.payload_json)
            return (
              <li key={ev.id} className={`event event-${ev.type}`}>
                <span className="event-dot" aria-hidden="true" />
                <div className="event-body">
                  <p>
                    {describeClaimEvent(t, ev, payload)}
                    <span className="muted small" title={formatDateTime(ev.created_at)}>
                      {' · '}
                      {formatRelative(ev.created_at)}
                    </span>
                  </p>
                  {payload?.claim_expires_at != null && (
                    <p className="muted small">
                      {t('claim.until', { at: formatDateTime(String(payload.claim_expires_at)) })}
                    </p>
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
