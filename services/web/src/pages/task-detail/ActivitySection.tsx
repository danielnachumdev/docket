import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import {
  api,
  type ActivityItem,
  type TaskComment,
  type TaskEvent,
} from '../../api'
import { Alert } from '../../components/Feedback'
import { Icon } from '../../components/Icon'
import { MarkdownView, MarkdownWithRefs } from '../../components/MarkdownView'
import { formatDateTime, formatRelative, humanize, statusLabel } from '../../lib/format'
import { useAction } from '../../lib/useAction'
import { CommentAttachmentList } from './CommentAttachmentList'
import './ActivitySection.css'
import './CommentsSection.css'

/** Traceability noise: claims/leases, artifact churn (also on comments / Artifacts), comment edits. */
const SECONDARY_EVENT_TYPES = new Set([
  'claimed',
  'claim_renewed',
  'released',
  'claim_failed',
  'release_failed',
  'heartbeat_failed',
  'artifact_added',
  'artifact_deleted',
  'artifact_updated',
  'comment_updated',
])

function isPrimaryActivityItem(item: ActivityItem): boolean {
  if (item.kind === 'comment') return true
  const type = item.event?.type
  if (!type) return true
  return !SECONDARY_EVENT_TYPES.has(type)
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

function refChipLabel(ref: {
  kind: string
  display_name?: string | null
  label?: string | null
  raw: string
  number?: number | null
  task_id?: string | null
  artifact_id?: number | null
  comment_id?: number | null
}) {
  if (ref.kind === 'user') return `@${ref.display_name ?? ref.label ?? ref.raw.slice(1)}`
  if (ref.kind === 'task') return `#${ref.number ?? ref.task_id ?? ref.raw.slice(1)}`
  if (ref.kind === 'artifact') return `&${ref.label ?? ref.artifact_id ?? ref.raw.slice(1)}`
  return `~${ref.comment_id ?? ref.raw.slice(1)}`
}

function CommentTimelineItem({
  comment,
  actorLabel,
  taskId,
}: {
  comment: TaskComment
  actorLabel: string
  taskId: string
}) {
  const { t } = useTranslation('tasks')
  const hasBody = Boolean(comment.body?.trim())
  return (
    <li id={`comment-${comment.id}`} className="event event-comment">
      <span className="event-dot" aria-hidden="true" />
      <article className="timeline-comment">
        <header className="comment-meta">
          <strong>{actorLabel}</strong>
          <span className="muted small" title={formatDateTime(comment.created_at)}>
            {formatRelative(comment.created_at)}
            {comment.updated_at !== comment.created_at ? ` · ${t('commentEdited')}` : ''}
          </span>
        </header>
        {hasBody &&
          ((comment.refs ?? []).length > 0 ? (
            <MarkdownWithRefs
              source={comment.body}
              refs={comment.refs ?? []}
              className="comment-body"
              renderRef={(ref, key) => (
                <span key={key} className={`comment-chip kind-${ref.kind}`}>
                  {refChipLabel(ref)}
                </span>
              )}
            />
          ) : (
            <MarkdownView source={comment.body} className="comment-body" />
          ))}
        {(comment.attachments?.length ?? 0) > 0 && (
          <CommentAttachmentList taskId={taskId} attachments={comment.attachments ?? []} />
        )}
      </article>
    </li>
  )
}

function EventTimelineItem({ item }: { item: ActivityItem }) {
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
      </div>
    </li>
  )
}

type Props = {
  taskId: string
  refreshKey?: number
}

const ORDER_KEY = 'waymark.activityOrder'
const SHOW_ALL_KEY = 'waymark.activityShowAll'

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

function readShowAll(): boolean {
  try {
    return sessionStorage.getItem(SHOW_ALL_KEY) === '1'
  } catch {
    return false
  }
}

function writeShowAll(showAll: boolean) {
  try {
    sessionStorage.setItem(SHOW_ALL_KEY, showAll ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** Page-flow timeline: each activity is a row; comments render as comment cards. */
export function ActivitySection({ taskId, refreshKey = 0 }: Props) {
  const { t } = useTranslation('detail')
  const [order, setOrder] = useState<'asc' | 'desc'>(readOrder)
  const [showAll, setShowAll] = useState(readShowAll)
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

  const visibleItems = useMemo(
    () => (showAll ? items : items.filter(isPrimaryActivityItem)),
    [items, showAll],
  )
  const hiddenCount = items.length - visibleItems.length

  function toggleOrder() {
    setOrder((prev) => {
      const next = prev === 'desc' ? 'asc' : 'desc'
      writeOrder(next)
      return next
    })
  }

  function toggleShowAll() {
    setShowAll((prev) => {
      const next = !prev
      writeShowAll(next)
      return next
    })
  }

  return (
    <section className="activity-timeline-block" aria-labelledby="activity-heading">
      <header className="activity-timeline-header">
        <h2 id="activity-heading">
          <Icon name="activity" />
          {t('activity.title')}
          {visibleItems.length > 0 && <span className="count">{visibleItems.length}</span>}
        </h2>
        <div className="activity-timeline-actions">
          {(hiddenCount > 0 || showAll) && (
            <button
              type="button"
              className={showAll ? 'btn ghost small active' : 'btn ghost small'}
              aria-pressed={showAll}
              title={showAll ? t('activity.showImportant') : t('activity.showAll')}
              disabled={busy}
              onClick={toggleShowAll}
            >
              {showAll
                ? t('activity.showImportant')
                : t('activity.showAllHidden', { count: hiddenCount })}
            </button>
          )}
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
        </div>
      </header>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {items.length === 0 ? (
        <p className="muted small activity-empty">{t('activity.empty')}</p>
      ) : visibleItems.length === 0 ? (
        <p className="muted small activity-empty">
          {t('activity.emptyFiltered')}{' '}
          <button type="button" className="btn ghost small" onClick={toggleShowAll}>
            {t('activity.showAll')}
          </button>
        </p>
      ) : (
        <ol className="timeline activity-timeline">
          {visibleItems.map((item) =>
            item.kind === 'comment' && item.comment ? (
              <CommentTimelineItem
                key={item.id}
                taskId={taskId}
                comment={item.comment}
                actorLabel={item.actor.label || item.comment.author_label}
              />
            ) : (
              <EventTimelineItem key={item.id} item={item} />
            ),
          )}
        </ol>
      )}
    </section>
  )
}
