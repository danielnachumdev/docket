import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type Task, type TaskDetail, type TaskEvent, type TaskShare } from '../api'
import { useAuth } from '../auth'
import { PriorityBadge, StatusBadge } from '../components/Badges'
import { Alert, Skeleton } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { Menu, type MenuItem } from '../components/Menu'
import { useConfirm } from '../lib/dialogs'
import { usePageTitle } from '../lib/usePageTitle'
import {
  PRIORITIES,
  STATUSES,
  formatDateTime,
  formatRelative,
  parseDate,
  priorityLabel,
  statusLabel,
} from '../lib/format'
import { useAction } from '../lib/useAction'
import { ActivitySection } from './task-detail/ActivitySection'
import { ArtifactsSection } from './task-detail/ArtifactsSection'
import { ClaimLeaseSection } from './task-detail/ClaimLeaseSection'
import { CommentsSection } from './task-detail/CommentsSection'
import { CompleteDoneDialog } from './task-detail/CompleteDoneDialog'
import { CompletionSection } from './task-detail/CompletionSection'
import { LinksSection } from './task-detail/LinksSection'
import { SharingSection } from './task-detail/SharingSection'
import { SubtasksSection } from './task-detail/SubtasksSection'

type Draft = {
  title: string
  body: string
  priority: number
  due: string
  parent: string
  requireArtifact: boolean
  outcomeSchema: string
}

function toLocalInput(iso: string | null) {
  const d = parseDate(iso)
  if (!d) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(value: string) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function prettySchema(raw: string | null) {
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function draftFrom(task: Task): Draft {
  return {
    title: task.title,
    body: task.body ?? '',
    priority: task.priority,
    due: toLocalInput(task.due_at),
    parent: task.parent_task_id != null ? String(task.parent_task_id) : '',
    requireArtifact: Boolean(task.require_artifact_on_done),
    outcomeSchema: prettySchema(task.outcome_schema_json),
  }
}

function descendantIds(taskId: string, all: Task[]): Set<string> {
  const ids = new Set<string>()
  const walk = (id: string) => {
    for (const t of all) {
      if (t.parent_task_id === id && !ids.has(t.id)) {
        ids.add(t.id)
        walk(t.id)
      }
    }
  }
  walk(taskId)
  return ids
}

export function TaskDetailPage() {
  const { t } = useTranslation(['detail', 'tasks', 'common'])
  const { id } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { status } = useAuth()
  const taskId = id ?? ''
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [parentTask, setParentTask] = useState<{ id: string; number: number; title: string } | null>(null)
  const [shares, setShares] = useState<TaskShare[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [completeOpen, setCompleteOpen] = useState(false)
  const { busy, error, setError, run } = useAction()

  const load = useCallback(async () => {
    const [data, all, shareRows] = await Promise.all([
      api.getTask(taskId),
      api.listTasks({ archived: false }),
      api.listShares(taskId),
    ])
    setDetail(data)
    setDraft(draftFrom(data.task))
    setAllTasks(all)
    setShares(shareRows)

    const parentId = data.task.parent_task_id
    if (parentId == null) {
      setParentTask(null)
    } else {
      const fromList = all.find((row) => row.id === parentId)
      if (fromList) {
        setParentTask({ id: fromList.id, number: fromList.number, title: fromList.title })
      } else {
        const parent = await api.getTask(parentId).catch(() => null)
        setParentTask({
          id: parentId,
          number: parent?.task.number ?? 0,
          title: parent?.task.title ?? '',
        })
      }
    }
  }, [taskId])

  useEffect(() => {
    setDetail(null)
    setLoadError(null)
    if (!taskId) {
      setLoadError(t('invalidId'))
      return
    }
    let cancelled = false
    void (async () => {
      try {
        await load()
        if (cancelled) return
        const task = await api.markTaskRead(taskId)
        if (cancelled) return
        setDetail((prev) =>
          prev ? { ...prev, task: { ...prev.task, unread: task.unread } } : prev,
        )
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : t('loadFailed'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load, taskId, t])

  const tasksById = useMemo(() => new Map(allTasks.map((row) => [row.id, row])), [allTasks])

  const parentChoices = useMemo(() => {
    const blocked = descendantIds(taskId, allTasks)
    blocked.add(taskId)
    return allTasks
      .filter((row) => !blocked.has(row.id))
      .sort((a, b) => a.title.localeCompare(b.title) || a.number - b.number)
  }, [allTasks, taskId])

  usePageTitle(detail?.task.title)

  const original = detail ? draftFrom(detail.task) : null
  const dirty =
    draft != null &&
    original != null &&
    (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== original[k])

  const save = useCallback(() => {
    if (!detail || !draft || !draft.title.trim()) return
    const saved = draftFrom(detail.task)
    const patch: Record<string, unknown> = {}
    if (draft.title.trim() !== saved.title) patch.title = draft.title.trim()
    if (draft.body !== saved.body) patch.body = draft.body
    if (draft.priority !== saved.priority) patch.priority = draft.priority
    if (draft.due !== saved.due) {
      const due = fromLocalInput(draft.due)
      if (due) patch.due_at = due
      else patch.clear_due_at = true
    }
    if (draft.parent !== saved.parent) {
      if (!draft.parent) patch.clear_parent = true
      else patch.parent_task_id = draft.parent
    }
    if (draft.requireArtifact !== saved.requireArtifact) {
      patch.require_artifact_on_done = draft.requireArtifact
    }
    if (draft.outcomeSchema !== saved.outcomeSchema) {
      const trimmed = draft.outcomeSchema.trim()
      if (!trimmed) {
        patch.clear_outcome_schema = true
      } else {
        try {
          patch.outcome_schema = JSON.parse(trimmed) as Record<string, unknown>
        } catch {
          setError(t('errors.outcomeSchemaInvalid'))
          return
        }
      }
    }
    void run(async () => {
      await api.updateTask(taskId, patch)
      await load()
    }, t('errors.save'))
  }, [detail, draft, load, run, setError, taskId, t])

  useEffect(() => {
    if (!dirty) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
      }
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [dirty, save])

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function changeStatus(next: string) {
    if (!detail) return
    if (next === 'done') {
      const needsDialog =
        detail.task.require_artifact_on_done || Boolean(detail.task.outcome_schema_json)
      if (needsDialog) {
        setCompleteOpen(true)
        return
      }
    }
    void run(async () => {
      await api.setStatus(taskId, next)
      await load()
    }, t('errors.status'))
  }

  function confirmDone(outcome?: Record<string, unknown>) {
    void run(async () => {
      await api.setStatus(taskId, 'done', outcome)
      setCompleteOpen(false)
      await load()
    }, t('errors.status'))
  }

  function toggleArchive() {
    if (!detail) return
    void run(async () => {
      if (detail.task.archived_at) await api.unarchive(taskId)
      else await api.archive(taskId)
      await load()
    }, t('errors.archive'))
  }

  function exportCasePack() {
    void run(async () => {
      await api.downloadTaskExport(taskId)
    }, t('errors.export'))
  }

  function toggleWatch() {
    if (!detail) return
    void run(async () => {
      if (detail.watching) await api.unwatchTask(taskId)
      else await api.watchTask(taskId)
      await load()
    }, t('errors.watch'))
  }

  function toggleUnread() {
    if (!detail) return
    const next = !detail.task.unread
    setDetail((prev) =>
      prev ? { ...prev, task: { ...prev.task, unread: next } } : prev,
    )
    void run(async () => {
      const task = next
        ? await api.markTaskUnread(taskId)
        : await api.markTaskRead(taskId)
      setDetail((prev) => (prev ? { ...prev, task: { ...prev.task, unread: task.unread } } : prev))
    }, t('errors.read'))
  }

  async function remove() {
    if (!detail) return
    const ok = await confirm({
      title: t('deleteTitle'),
      description: t('deleteBody', { title: detail.task.title }),
      confirmLabel: t('common:delete'),
      danger: true,
    })
    if (!ok) return
    const parentId = detail.task.parent_task_id
    void run(async () => {
      await api.deleteTask(taskId)
      navigate(parentId ? `/tasks/${parentId}` : '/')
    }, t('errors.delete'))
  }

  if (loadError) {
    return (
      <main className="page">
        <Alert>{loadError}</Alert>
        <Link to="/" className="btn">
          <Icon name="arrowLeft" className="flip-rtl" />
          {t('backToTasks')}
        </Link>
      </main>
    )
  }

  if (!detail || !draft) {
    return (
      <main className="page">
        <Skeleton rows={6} />
      </main>
    )
  }

  const task = detail.task
  const me = status?.user
  const isOwner = me?.id === task.owner_user_id
  const myShare = shares.find((s) => s.user_id === me?.id)
  const canComment =
    isOwner ||
    myShare?.role === 'commentor' ||
    myShare?.role === 'editor' ||
    Boolean(status?.permissions.includes('tasks:comment') && myShare == null)
  const names = new Map<number, string>(shares.map((s) => [s.user_id, s.display_name]))

  const actorUserLabel = (ev: TaskEvent) =>
    ev.actor_user_id === me?.id
      ? t('actor.you')
      : (names.get(ev.actor_user_id) ?? t('actor.user', { id: ev.actor_user_id }))

  const actorName = (ev: TaskEvent) => {
    const who = actorUserLabel(ev)
    if (ev.actor_token_id == null) return who
    const tokenLabel = ev.actor_token_name ? `token:${ev.actor_token_name}` : t('actor.apiToken')
    const role = ev.actor_role_name ? ` · ${ev.actor_role_name}` : ''
    return `${who} (${tokenLabel}${role})`
  }

  const menuItems: MenuItem[] = [
    { label: t('export'), icon: 'download', onSelect: exportCasePack, disabled: busy },
    ...(task.archived_at
      ? []
      : [{ label: t('archive'), icon: 'archive' as const, onSelect: toggleArchive, disabled: busy }]),
    {
      label: t('delete'),
      icon: 'trash',
      onSelect: () => void remove(),
      danger: true,
      disabled: busy,
    },
  ]

  return (
    <main className={dirty ? 'page has-savebar' : 'page'}>
      <nav className="breadcrumb" aria-label={t('breadcrumb')}>
        <Link to={task.archived_at ? '/?view=archived' : '/'}>
          <Icon name="arrowLeft" size={14} className="flip-rtl" />
          {task.archived_at ? t('tasks:archivedTitle') : t('tasks:title')}
        </Link>
        {parentTask && (
          <>
            <Icon name="chevronRight" size={12} className="flip-rtl" />
            <Link to={`/tasks/${parentTask.id}`} className="truncate">
              {parentTask.title || t('parentFallback', { number: parentTask.number })}
            </Link>
          </>
        )}
        <Icon name="chevronRight" size={12} className="flip-rtl" />
        <span className="mono">#{task.number}</span>
      </nav>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {task.last_error && (
        <div className="notice notice-error" role="status">
          <Icon name="alert" />
          <span>
            <strong>{t('lastError')}</strong>
            {': '}
            {task.last_error}
          </span>
        </div>
      )}
      {task.archived_at && (
        <div className="notice">
          <Icon name="archive" />
          <span>{t('archivedNotice', { when: formatRelative(task.archived_at) })}</span>
          <button type="button" className="btn small" disabled={busy} onClick={toggleArchive}>
            {t('restore')}
          </button>
        </div>
      )}

      <header className="detail-header">
        <div className="detail-title-row">
          <textarea
            className="title-input"
            value={draft.title}
            rows={1}
            aria-label={t('titleLabel')}
            placeholder={t('titleLabel')}
            onChange={(e) => update('title', e.target.value.replace(/\n/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                save()
              }
            }}
          />
          <div className="detail-actions">
            <button
              type="button"
              className={task.unread ? 'icon-btn unread-active' : 'icon-btn'}
              disabled={busy}
              aria-pressed={task.unread}
              aria-label={task.unread ? t('tasks:markRead') : t('tasks:markUnread')}
              title={task.unread ? t('tasks:markRead') : t('tasks:markUnread')}
              onClick={toggleUnread}
            >
              <Icon name={task.unread ? 'mail' : 'mailOpen'} />
            </button>
            <button
              type="button"
              className={detail.watching ? 'btn small watching' : 'btn small'}
              disabled={busy}
              aria-pressed={detail.watching}
              title={t('watchHint')}
              onClick={toggleWatch}
            >
              <Icon name={detail.watching ? 'eye' : 'eyeOff'} />
              {detail.watching ? t('watching') : t('watch')}
            </button>
            <Menu label={t('common:moreActions')} items={menuItems} />
          </div>
        </div>
        <div className="detail-meta">
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          {task.shared && (
            <span className="tag shared-tag" title={t('sharedHint')}>
              <Icon name="users" size={12} />
              {t('tasks:shared')}
            </span>
          )}
          {task.unread && <span className="tag unread-tag">{t('unread')}</span>}
          <span className="muted small" title={formatDateTime(task.created_at)}>
            {t('created', { when: formatRelative(task.created_at) })}
          </span>
          {task.source && task.source !== 'ui' && (
            <span className="tag">{t('via', { source: task.source })}</span>
          )}
        </div>
      </header>

      <div className="detail-grid">
        <div className="detail-main">
          <section className="card">
            <label className="notes">
              <span className="card-label">{t('notes')}</span>
              <textarea
                rows={Math.min(16, Math.max(4, draft.body.split('\n').length + 1))}
                value={draft.body}
                onChange={(e) => update('body', e.target.value)}
                placeholder={t('notesPlaceholder')}
              />
            </label>
          </section>
          <SubtasksSection taskId={taskId} subtasks={detail.children} onChanged={load} />
          <ArtifactsSection taskId={taskId} artifacts={detail.artifacts} onChanged={load} />
          <CommentsSection
            taskId={taskId}
            artifacts={detail.artifacts}
            tasks={allTasks}
            shares={shares}
            canComment={canComment}
            onChanged={load}
          />
          <ClaimLeaseSection task={task} events={detail.events} />
          <ActivitySection
            events={detail.events}
            actorName={actorName}
            actorUserLabel={actorUserLabel}
          />
        </div>

        <aside className="detail-side detail-props">
          <section className="card">
            <span className="card-label" id="status-label">
              {t('status')}
            </span>
            <div className="status-picker" role="radiogroup" aria-labelledby="status-label">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={task.status === s}
                  className={`status-option status-${s}${task.status === s ? ' active' : ''}`}
                  disabled={busy}
                  onClick={() => task.status !== s && changeStatus(s)}
                >
                  <span className="status-dot" aria-hidden="true" />
                  {statusLabel(s)}
                </button>
              ))}
            </div>
          </section>

          <section className="card stack">
            <span className="card-label">{t('details')}</span>
            <label className="field">
              <span>{t('priority')}</span>
              <select value={draft.priority} onChange={(e) => update('priority', Number(e.target.value))}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t('priorityOption', { priority: p, label: priorityLabel(p) })}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('deadline')}</span>
              <span className="input-with-action">
                <input
                  type="datetime-local"
                  value={draft.due}
                  onChange={(e) => update('due', e.target.value)}
                />
                {draft.due && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('clearDeadline')}
                    title={t('clearDeadline')}
                    onClick={() => update('due', '')}
                  >
                    <Icon name="x" />
                  </button>
                )}
              </span>
            </label>
            <label className="field">
              <span>{t('parentTask')}</span>
              <select value={draft.parent} onChange={(e) => update('parent', e.target.value)}>
                <option value="">{t('parentNone')}</option>
                {parentChoices.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.number} · {p.title}
                  </option>
                ))}
                {parentTask && !parentChoices.some((p) => p.id === parentTask.id) && (
                  <option value={parentTask.id}>
                    #{parentTask.number} ·{' '}
                    {parentTask.title || t('parentFallback', { number: parentTask.number })}
                  </option>
                )}
              </select>
            </label>
          </section>
        </aside>

        <aside className="detail-side detail-related">
          <LinksSection taskId={taskId} links={detail.links ?? []} tasksById={tasksById} onChanged={load} />
          <SharingSection taskId={taskId} shares={shares} isOwner={isOwner} onChanged={load} />
          <CompletionSection
            requireArtifact={draft.requireArtifact}
            schemaText={draft.outcomeSchema}
            onRequireArtifact={(value) => update('requireArtifact', value)}
            onSchemaText={(value) => update('outcomeSchema', value)}
            recordedOutcome={task.outcome_json}
          />
        </aside>
      </div>

      {completeOpen && (
        <CompleteDoneDialog
          requireArtifact={task.require_artifact_on_done}
          artifactCount={detail.artifacts.length}
          schemaText={task.outcome_schema_json}
          busy={busy}
          onCancel={() => setCompleteOpen(false)}
          onConfirm={confirmDone}
        />
      )}

      {dirty && (
        <div className="savebar" role="region" aria-label={t('unsavedChanges')}>
          <span>
            <strong>{t('unsavedChanges')}</strong>
            <span className="muted small hide-mobile"> · {t('saveShortcut')}</span>
          </span>
          <span className="actions">
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setDraft(draftFrom(task))}>
              {t('discard')}
            </button>
            <button type="button" className="btn primary" disabled={busy || !draft.title.trim()} onClick={save}>
              {busy ? t('common:saving') : t('common:save')}
            </button>
          </span>
        </div>
      )}
    </main>
  )
}

