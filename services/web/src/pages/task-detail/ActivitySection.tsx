import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { Menu } from '../../components/Menu'
import { MarkdownView, MarkdownWithRefs } from '../../components/MarkdownView'
import { formatDateTime, formatRelative, humanize, statusLabel } from '../../lib/format'
import { useAction } from '../../lib/useAction'
import { userBidiAttrs } from '../../lib/bidi'
import { useConfirm } from '../../lib/dialogs'
import { CommentAttachmentList } from './CommentAttachmentList'
import { CommentRefChip } from './CommentRefChip'
import { commentAnchorId, highlightComment } from './commentAnchors'
import { useHashHighlight } from './useHashHighlight'
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

function CommentTimelineItem({
  comment,
  actorLabel,
  taskId,
  artifacts,
  commentsById,
  onChanged,
}: {
  comment: TaskComment
  actorLabel: string
  taskId: string
  artifacts: Artifact[]
  commentsById: Map<number, TaskComment>
  onChanged: () => Promise<void>
}) {
  const { t } = useTranslation(['tasks', 'common'])
  const confirm = useConfirm()
  const { busy, error, setError, run } = useAction()
  const [draft, setDraft] = useState<string | null>(null)
  const hasBody = Boolean(comment.body?.trim())
  const permalink = `${window.location.pathname}#${commentAnchorId(comment.id)}`

  function save() {
    if (draft == null || !draft.trim()) return
    void run(async () => {
      await api.updateComment(taskId, comment.id, draft.trim())
      setDraft(null)
      await onChanged()
    }, t('commentUpdateFailed'))
  }

  async function remove() {
    const ok = await confirm({
      title: t('commentDeleteTitle'),
      description: t('commentDeleteConfirm'),
      confirmLabel: t('common:delete'),
      danger: true,
    })
    if (!ok) return
    void run(async () => {
      await api.deleteComment(taskId, comment.id)
      await onChanged()
    }, t('commentDeleteFailed'))
  }

  return (
    <li id={commentAnchorId(comment.id)} className="event event-comment">
      <span className="event-dot" aria-hidden="true" />
      <article className="timeline-comment">
        <header className="comment-meta">
          <strong>{actorLabel}</strong>
          <span className="muted small" title={formatDateTime(comment.created_at)}>
            {formatRelative(comment.created_at)}
            {comment.updated_at !== comment.created_at ? ` · ${t('commentEdited')}` : ''}
          </span>
          <span className="comment-meta-actions">
            <a
              className="icon-btn comment-permalink"
              href={permalink}
              title={t('commentPermalink')}
              aria-label={t('commentPermalink')}
              onClick={(e) => {
                e.preventDefault()
                window.history.replaceState(null, '', permalink)
                highlightComment(comment.id)
              }}
            >
              <Icon name="link" size={14} />
            </a>
            {comment.can_edit && draft == null && (
              <Menu
                label={t('commentActions')}
                className="comment-menu"
                items={[
                  { label: t('commentEdit'), onSelect: () => setDraft(comment.body), disabled: busy },
                  {
                    label: t('commentDelete'),
                    icon: 'trash',
                    danger: true,
                    disabled: busy,
                    onSelect: () => void remove(),
                  },
                ]}
              />
            )}
          </span>
        </header>
        {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
        {draft != null ? (
          <form
            className="comment-edit"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <textarea
              {...userBidiAttrs(draft)}
              aria-label={t('commentEdit')}
              rows={Math.min(12, Math.max(3, draft.split('\n').length + 1))}
              value={draft}
              disabled={busy}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setDraft(null)
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
              }}
            />
            <div className="comment-edit-actions">
              <button type="button" className="btn ghost small" disabled={busy} onClick={() => setDraft(null)}>
                {t('commentCancel')}
              </button>
              <button type="submit" className="btn primary small" disabled={busy || !draft.trim()}>
                {t('commentSave')}
              </button>
            </div>
          </form>
        ) : (
          hasBody &&
          ((comment.refs ?? []).length > 0 ? (
            <MarkdownWithRefs
              source={comment.body}
              refs={comment.refs}
              className="comment-body"
              renderRef={(ref, key) => (
                <CommentRefChip
                  key={key}
                  taskId={taskId}
                  commentRef={ref}
                  artifacts={artifacts}
                  commentsById={commentsById}
                />
              )}
            />
          ) : (
            <MarkdownView source={comment.body} className="comment-body" />
          ))
        )}
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
  artifacts?: Artifact[]
  refreshKey?: number
  onCommentsChanged: () => Promise<void>
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

/** Page-flow timeline: each activity is a row; comments render as comment cards. */
export function ActivitySection({
  taskId,
  artifacts = [],
  refreshKey = 0,
  onCommentsChanged,
}: Props) {
  const { t } = useTranslation('detail')
  const [order, setOrder] = useState<'asc' | 'desc'>(readOrder)
  const [showAll, setShowAll] = useState(false)
  const [items, setItems] = useState<ActivityItem[]>([])
  const { busy, error, setError, run } = useAction()

  const reload = useCallback(() => {
    void run(async () => {
      const feed = await api.listActivity(taskId, order)
      setItems(feed.items)
    }, t('activity.loadFailed'))
  }, [order, run, t, taskId])

  useEffect(() => {
    setShowAll(false)
  }, [taskId])

  useEffect(() => {
    reload()
  }, [reload, refreshKey])

  const commentsById = useMemo(() => {
    const map = new Map<number, TaskComment>()
    for (const item of items) {
      if (item.kind === 'comment' && item.comment) map.set(item.comment.id, item.comment)
    }
    return map
  }, [items])

  const artifactsForRefs = useMemo(() => {
    const byId = new Map<number, Artifact>()
    for (const row of artifacts) byId.set(row.id, row)
    for (const comment of commentsById.values()) {
      for (const att of comment.attachments ?? []) byId.set(att.id, att)
    }
    return [...byId.values()]
  }, [artifacts, commentsById])

  const visibleItems = useMemo(
    () => (showAll ? items : items.filter(isPrimaryActivityItem)),
    [items, showAll],
  )
  const hiddenCount = items.length - visibleItems.length

  useHashHighlight(`${taskId}:${visibleItems.length}:${items.length}`)

  function toggleOrder() {
    setOrder((prev) => {
      const next = prev === 'desc' ? 'asc' : 'desc'
      writeOrder(next)
      return next
    })
  }

  function toggleShowAll() {
    setShowAll((prev) => !prev)
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
                artifacts={artifactsForRefs}
                commentsById={commentsById}
                onChanged={onCommentsChanged}
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
