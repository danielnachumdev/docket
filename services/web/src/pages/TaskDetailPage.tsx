import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type Task, type TaskDetail, type TaskEvent, type TaskShare } from '../api'
import { useAuth } from '../auth'
import { PriorityBadge, StatusBadge } from '../components/Badges'
import { Alert, Skeleton } from '../components/Feedback'
import { Icon } from '../components/Icon'
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
  const { id } = useParams()
  const navigate = useNavigate()
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
      const fromList = all.find((t) => t.id === parentId)
      if (fromList) {
        setParentTask({ id: fromList.id, number: fromList.number, title: fromList.title })
      } else {
        const parent = await api.getTask(parentId).catch(() => null)
        setParentTask({
          id: parentId,
          number: parent?.task.number ?? 0,
          title: parent?.task.title ?? `Task #${parent?.task.number ?? '?'}`,
        })
      }
    }
  }, [taskId])

  useEffect(() => {
    setDetail(null)
    setLoadError(null)
    if (!taskId) {
      setLoadError('Invalid task id')
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
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load, taskId])

  const tasksById = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks])

  const parentChoices = useMemo(() => {
    const blocked = descendantIds(taskId, allTasks)
    blocked.add(taskId)
    return allTasks
      .filter((t) => !blocked.has(t.id))
      .sort((a, b) => a.title.localeCompare(b.title) || a.number - b.number)
  }, [allTasks, taskId])

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
          setError('Outcome schema must be valid JSON')
          return
        }
      }
    }
    void run(async () => {
      await api.updateTask(taskId, patch)
      await load()
    }, 'Could not save changes')
  }, [detail, draft, load, run, setError, taskId])

  useEffect(() => {
    if (!dirty) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
    }, 'Could not change status')
  }

  function confirmDone(outcome?: Record<string, unknown>) {
    void run(async () => {
      await api.setStatus(taskId, 'done', outcome)
      setCompleteOpen(false)
      await load()
    }, 'Could not change status')
  }

  function toggleArchive() {
    if (!detail) return
    void run(async () => {
      if (detail.task.archived_at) await api.unarchive(taskId)
      else await api.archive(taskId)
      await load()
    }, 'Could not update archive state')
  }

  function exportCasePack() {
    void run(async () => {
      await api.downloadTaskExport(taskId)
    }, 'Could not download export')
  }

  function toggleWatch() {
    if (!detail) return
    void run(async () => {
      if (detail.watching) await api.unwatchTask(taskId)
      else await api.watchTask(taskId)
      await load()
    }, 'Could not update watch')
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
    }, 'Could not update read state')
  }

  function remove() {
    if (!detail || !window.confirm(`Delete “${detail.task.title}” permanently? This cannot be undone.`)) return
    const parentId = detail.task.parent_task_id
    void run(async () => {
      await api.deleteTask(taskId)
      navigate(parentId ? `/tasks/${parentId}` : '/')
    }, 'Could not delete task')
  }

  if (loadError) {
    return (
      <main className="page">
        <Alert>{loadError}</Alert>
        <Link to="/" className="btn">
          <Icon name="arrowLeft" />
          Back to tasks
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
  const names = new Map<number, string>(shares.map((s) => [s.user_id, s.display_name]))

  const actorUserLabel = (ev: TaskEvent) =>
    ev.actor_user_id === me?.id ? 'You' : (names.get(ev.actor_user_id) ?? `User #${ev.actor_user_id}`)

  const actorName = (ev: TaskEvent) => {
    const who = actorUserLabel(ev)
    if (ev.actor_token_id == null) return who
    const tokenLabel = ev.actor_token_name ? `token:${ev.actor_token_name}` : 'API token'
    const role = ev.actor_role_name ? ` · ${ev.actor_role_name}` : ''
    return `${who} (${tokenLabel}${role})`
  }

  return (
    <main className={dirty ? 'page has-savebar' : 'page'}>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to={task.archived_at ? '/?view=archived' : '/'}>
          <Icon name="arrowLeft" size={14} />
          {task.archived_at ? 'Archived' : 'Tasks'}
        </Link>
        {parentTask && (
          <>
            <Icon name="chevronRight" size={12} />
            <Link to={`/tasks/${parentTask.id}`} className="truncate">
              {parentTask.title}
            </Link>
          </>
        )}
        <Icon name="chevronRight" size={12} />
        <span className="mono">#{task.number}</span>
      </nav>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {task.last_error && (
        <div className="notice notice-error" role="status">
          <Icon name="alert" />
          <span>
            <strong>Last error</strong>
            {': '}
            {task.last_error}
          </span>
        </div>
      )}
      {task.archived_at && (
        <div className="notice">
          <Icon name="archive" />
          <span>This task was archived {formatRelative(task.archived_at)}.</span>
          <button type="button" className="btn small" disabled={busy} onClick={toggleArchive}>
            Restore
          </button>
        </div>
      )}

      <header className="detail-header">
        <textarea
          className="title-input"
          value={draft.title}
          rows={1}
          aria-label="Task title"
          placeholder="Task title"
          onChange={(e) => update('title', e.target.value.replace(/\n/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              save()
            }
          }}
        />
        <div className="detail-meta">
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          <span className="muted small" title={formatDateTime(task.created_at)}>
            Created {formatRelative(task.created_at)}
          </span>
          {task.source && task.source !== 'ui' && <span className="tag">via {task.source}</span>}
          <span className="detail-actions">
            <button
              type="button"
              className={`btn ghost small${task.unread ? ' unread-active' : ''}`}
              disabled={busy}
              aria-pressed={task.unread}
              onClick={toggleUnread}
              title={task.unread ? 'Mark read' : 'Mark unread'}
            >
              <Icon name={task.unread ? 'mail' : 'mailOpen'} />
              {task.unread ? 'Unread' : 'Read'}
            </button>
            <button
              type="button"
              className="btn ghost small"
              disabled={busy}
              onClick={exportCasePack}
              title="Download immutable audit pack (zip)"
            >
              <Icon name="download" />
              Export
            </button>
            <button
              type="button"
              className={`btn ghost small${detail.watching ? ' watching' : ''}`}
              disabled={busy}
              aria-pressed={detail.watching}
              onClick={toggleWatch}
            >
              <Icon name={detail.watching ? 'eye' : 'eyeOff'} />
              {detail.watching ? 'Watching' : 'Watch'}
            </button>
            {!task.archived_at && (
              <button type="button" className="btn ghost small" disabled={busy} onClick={toggleArchive}>
                <Icon name="archive" />
                Archive
              </button>
            )}
            <button type="button" className="btn ghost small danger" disabled={busy} onClick={remove}>
              <Icon name="trash" />
              Delete
            </button>
          </span>
        </div>
      </header>

      <div className="detail-grid">
        <div className="detail-main">
          <section className="card">
            <label className="notes">
              <span className="card-label">Notes</span>
              <textarea
                rows={Math.min(16, Math.max(4, draft.body.split('\n').length + 1))}
                value={draft.body}
                onChange={(e) => update('body', e.target.value)}
                placeholder="Add context, acceptance criteria, or anything an agent should know…"
              />
            </label>
          </section>
          <SubtasksSection taskId={taskId} subtasks={detail.children} onChanged={load} />
          <ArtifactsSection taskId={taskId} artifacts={detail.artifacts} onChanged={load} />
          <CommentsSection taskId={taskId} onChanged={load} />
          <ClaimLeaseSection task={task} events={detail.events} />
          <ActivitySection
            events={detail.events}
            actorName={actorName}
            actorUserLabel={actorUserLabel}
          />
        </div>

        <aside className="detail-side detail-props">
          <section className="card">
            <span className="card-label">Status</span>
            <div className="status-picker" role="radiogroup" aria-label="Status">
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
            <label className="field">
              <span>Priority</span>
              <select value={draft.priority} onChange={(e) => update('priority', Number(e.target.value))}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    P{p} · {priorityLabel(p)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Deadline</span>
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
                    aria-label="Clear deadline"
                    title="Clear deadline"
                    onClick={() => update('due', '')}
                  >
                    <Icon name="x" />
                  </button>
                )}
              </span>
            </label>
            <label className="field">
              <span>Parent task</span>
              <select value={draft.parent} onChange={(e) => update('parent', e.target.value)}>
                <option value="">None (top level)</option>
                {parentChoices.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.number} · {p.title}
                  </option>
                ))}
                {parentTask && !parentChoices.some((p) => p.id === parentTask.id) && (
                  <option value={parentTask.id}>
                    #{parentTask.number} · {parentTask.title}
                  </option>
                )}
              </select>
            </label>
          </section>

          <CompletionSection
            requireArtifact={draft.requireArtifact}
            schemaText={draft.outcomeSchema}
            onRequireArtifact={(value) => update('requireArtifact', value)}
            onSchemaText={(value) => update('outcomeSchema', value)}
            recordedOutcome={task.outcome_json}
          />
        </aside>

        <aside className="detail-side detail-related">
          <LinksSection taskId={taskId} links={detail.links ?? []} tasksById={tasksById} onChanged={load} />
          <SharingSection taskId={taskId} shares={shares} isOwner={isOwner} onChanged={load} />
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
        <div className="savebar" role="region" aria-label="Unsaved changes">
          <span>
            <strong>Unsaved changes</strong>
            <span className="muted small hide-mobile"> · Ctrl/⌘ + S to save</span>
          </span>
          <span className="actions">
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setDraft(draftFrom(task))}>
              Discard
            </button>
            <button type="button" className="btn primary" disabled={busy || !draft.title.trim()} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </span>
        </div>
      )}
    </main>
  )
}
