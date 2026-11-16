import { useCallback, useEffect, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import {
  api,
  type ActivityItem,
  type Artifact,
  type TaskComment,
  type TaskEvent,
} from '../../api'
import { Alert } from '../../components/Feedback'
import { Icon } from '../../components/Icon'
import { Section } from '../../components/Section'
import { UserBidiText } from '../../components/UserBidiText'
import { userBidiAttrs } from '../../lib/bidi'
import { formatDateTime, formatRelative, humanize, statusLabel } from '../../lib/format'
import { useAction } from '../../lib/useAction'
import './ActivitySection.css'
import './CommentsSection.css'

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
      const reason = text(payload.reason)
      if (payload.from) {
        return reason
          ? e('statusChangedFromToReason', {
              from: statusLabel(String(payload.from)),
              to,
              reason,
            })
          : e('statusChangedFromTo', { from: statusLabel(String(payload.from)), to })
      }
      return reason ? e('statusChangedToReason', { to, reason }) : e('statusChangedTo', { to })
    }
    case 'updated': {
      const fields = Object.keys(payload ?? {}).map((k) => {
        if (k === 'body') return t('activity.field.description')
        return t(`activity.field.${k}`, { defaultValue: humanize(k).toLowerCase() })
      })
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
    case 'artifact_updated': {
      const title = text(payload?.title)
      return title ? e('artifactUpdated', { title }) : e('artifactUpdatedPlain')
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
    case 'comment_updated':
      return e('commentUpdated')
    case 'comment_deleted':
      return e('commentDeleted')
    case 'commented': {
      const body = text(payload?.body)
      return body ? e('commented', { body }) : e('commentedPlain')
    }
    default:
      return humanize(event.type).toLowerCase()
  }
}

function CommentAttachments({ attachments }: { attachments: Artifact[] }) {
  if (!attachments.length) return null
  return (
    <ul className="activity-attachments">
      {attachments.map((art) => (
        <li key={art.id} className="activity-attachment">
          <Icon name="paperclip" size={12} />
          <span>{art.title}</span>
          <span className="muted small">{art.kind}</span>
        </li>
      ))}
    </ul>
  )
}

function CommentRow({ comment, actorLabel }: { comment: TaskComment; actorLabel: string }) {
  const { t } = useTranslation('tasks')
  return (
    <li id={`comment-${comment.id}`} className="event event-comment">
      <span className="event-dot" aria-hidden="true" />
      <div className="event-body">
        <p>
          <strong>{actorLabel}</strong>{' '}
          <span className="muted small" title={formatDateTime(comment.created_at)}>
            {formatRelative(comment.created_at)}
            {comment.updated_at !== comment.created_at ? ` · ${t('commentEdited')}` : ''}
          </span>
        </p>
        <div {...userBidiAttrs(comment.body, 'comment-body')}>
          <UserBidiText text={comment.body} />
        </div>
        <CommentAttachments attachments={comment.attachments ?? []} />
      </div>
    </li>
  )
}

function EventRow({ item }: { item: ActivityItem }) {
  const { t } = useTranslation('detail')
  const event = item.event
  if (!event) return null
  const payload = parsePayload(event.payload_json)
  return (
    <li className={`event event-${event.type}`}>
      <span className="event-dot" aria-hidden="true" />
      <div className="event-body">
        <p>
          <strong>{item.actor.label}</strong> {describe(t, event, payload)}
          <span className="muted small" title={formatDateTime(event.created_at)}>
            {' · '}
            {formatRelative(event.created_at)}
          </span>
        </p>
        {event.payload_json && (
          <div className="event-details">
            <details>
              <summary>{t('activity.payload')}</summary>
              <pre>{payload ? JSON.stringify(payload, null, 2) : event.payload_json}</pre>
            </details>
          </div>
        )}
      </div>
    </li>
  )
}

type Props = {
  taskId: string
  refreshKey?: number
  variant?: 'card' | 'plain'
}

const ORDER_KEY = 'waymark.activityOrder'

function readOrder(): 'asc' | 'desc' {
  try {
    return sessionStorage.getItem(ORDER_KEY) === 'asc' ? 'asc' : 'desc'
  } catch {
    return 'desc'
  }
}

function writeOrder(order: 'asc' | 'desc') {
  try {
    sessionStorage.setItem(ORDER_KEY, order)
  } catch {
    /* ignore */
  }
}

export function ActivitySection({ taskId, refreshKey = 0, variant = 'card' }: Props) {
  const { t } = useTranslation('detail')
  const [order, setOrder] = useState<'asc' | 'desc'>(readOrder)
  const [items, setItems] = useState<ActivityItem[]>([])
  const { busy, error, setError, run } = useAction()

  const reload = useCallback(() => {
    void run(async () => {
      const feed = await api.listActivity(taskId, order)
      setItems(feed.items)
    }, t('activity.loadFailed'))
  }, [order, run, t, taskId])

  useEffect(() => {
    reload()
  }, [reload, refreshKey])

  function toggleOrder() {
    setOrder((prev) => {
      const next = prev === 'desc' ? 'asc' : 'desc'
      writeOrder(next)
      return next
    })
  }

  return (
    <Section
      icon="activity"
      title={t('activity.title')}
      variant={variant}
      count={items.length}
      action={
        <button
          type="button"
          className="btn ghost small"
          aria-label={
            order === 'desc' ? t('activity.sortOldest') : t('activity.sortNewest')
          }
          title={order === 'desc' ? t('activity.sortOldest') : t('activity.sortNewest')}
          disabled={busy}
          onClick={toggleOrder}
        >
          <Icon name="activity" size={14} />
          {order === 'desc' ? t('activity.newestFirst') : t('activity.oldestFirst')}
        </button>
      }
    >
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {items.length === 0 ? (
        <p className="muted small activity-empty">{t('activity.empty')}</p>
      ) : (
        <div className="activity-scroll">
          <ol className="timeline activity-timeline">
            {items.map((item) =>
              item.kind === 'comment' && item.comment ? (
                <CommentRow
                  key={item.id}
                  comment={item.comment}
                  actorLabel={item.actor.label || item.comment.author_label}
                />
              ) : (
                <EventRow key={item.id} item={item} />
              ),
            )}
          </ol>
        </div>
      )}
    </Section>
  )
}
