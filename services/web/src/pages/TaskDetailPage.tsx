import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type Artifact, type Task, type TaskDetail, type TaskShare } from '../api'
import { useAuth } from '../auth'
import { useMediaQuery } from '../lib/useMediaQuery'
import { PriorityBadge, StatusBadge } from '../components/Badges'
import { Alert } from '../components/Feedback'
import { DetailSkeleton } from '../components/Skeleton'
import { Icon } from '../components/Icon'
import { MarkdownView } from '../components/MarkdownView'
import { Menu, type MenuItem } from '../components/Menu'
import { TaskLinkShareMenu } from '../components/TaskLinkShareMenu'
import { Section } from '../components/Section'
import { UserBidiText } from '../components/UserBidiText'
import { isMixedBidi, userBidiAttrs } from '../lib/bidi'
import { useConfirm, usePrompt } from '../lib/dialogs'
import { useToast } from '../lib/toast'
import { usePageTitle } from '../lib/usePageTitle'
import {
  PRIORITIES,
  STATUSES,
  formatDateTime,
  formatRelative,
  isClosed,
  isPauseStatus,
  parseDate,
  priorityLabel,
  statusLabel,
} from '../lib/format'
import { HorizonDueChips, type HorizonDueChoice } from '../components/HorizonDueMenu'
import { dueAtIsoForHorizon, type HorizonId } from '../lib/localDay'
import { useAction } from '../lib/useAction'
import { usePrefetchArtifactBlobs } from '../lib/usePrefetchArtifactBlobs'
import { ActivitySection } from './task-detail/ActivitySection'
import { ArtifactsSection } from './task-detail/ArtifactsSection'
import { ClaimLeaseSection } from './task-detail/ClaimLeaseSection'
import { CommentsSection } from './task-detail/CommentsSection'
import { CompleteDoneDialog } from './task-detail/CompleteDoneDialog'
import { CompletionSection } from './task-detail/CompletionSection'
import { LinksSection } from './task-detail/LinksSection'
import { SharingSection } from './task-detail/SharingSection'
import { SubtasksSection } from './task-detail/SubtasksSection'
import './TaskDetailPage.css'

type Draft = {
  title: string
  description: string
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
    description: task.description ?? '',
    priority: task.priority,
    due: toLocalInput(task.due_at),
    parent: task.parent_task_id != null ? String(task.parent_task_id) : '',
    requireArtifact: Boolean(task.require_artifact_on_done),
    outcomeSchema: prettySchema(task.outcome_schema_json),
  }
}

const NO_ARTIFACTS: Artifact[] = []
const DETAIL_RAIL_DEFAULT_PX = 352
const DETAIL_RAIL_MIN_PX = 256
const DETAIL_RAIL_MAX_PX = 640
const DETAIL_RAIL_COLLAPSED = '4rem'

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
  const prompt = usePrompt()
  const toast = useToast()
  const { status } = useAuth()
  const taskId = id ?? ''
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [parentTask, setParentTask] = useState<{ id: string; number: number; title: string } | null>(null)
  const [shares, setShares] = useState<TaskShare[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [notesMode, setNotesMode] = useState<'edit' | 'preview'>('preview')
  const [sideCollapsed, setSideCollapsed] = useState(false)
  const [railWidthPx, setRailWidthPx] = useState(DETAIL_RAIL_DEFAULT_PX)
  const [activityTick, setActivityTick] = useState(0)
  const railStacked = useMediaQuery('(max-width: 1100px)')
  const { busy, error, setError, run } = useAction()
  const dueInputRef = useRef<HTMLInputElement>(null)

  const detailGridStyle = useMemo(
    () =>
      ({
        '--detail-rail-w': sideCollapsed ? DETAIL_RAIL_COLLAPSED : `${railWidthPx}px`,
      }) as CSSProperties,
    [railWidthPx, sideCollapsed],
  )

  const onRailResizeStart = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (sideCollapsed) return
      e.preventDefault()
      const handle = e.currentTarget
      handle.setPointerCapture(e.pointerId)
      const startX = e.clientX
      const startW = railWidthPx

      const onMove = (ev: globalThis.PointerEvent) => {
        const delta = ev.clientX - startX
        const rtl = document.documentElement.dir === 'rtl'
        const nextRaw = rtl ? startW + delta : startW - delta
        const next = Math.min(DETAIL_RAIL_MAX_PX, Math.max(DETAIL_RAIL_MIN_PX, nextRaw))
        setRailWidthPx(next)
      }

      const onUp = (ev: globalThis.PointerEvent) => {
        handle.releasePointerCapture(ev.pointerId)
        handle.removeEventListener('pointermove', onMove)
        handle.removeEventListener('pointerup', onUp)
        handle.removeEventListener('pointercancel', onUp)
      }

      handle.addEventListener('pointermove', onMove)
      handle.addEventListener('pointerup', onUp)
      handle.addEventListener('pointercancel', onUp)
    },
    [railWidthPx, sideCollapsed],
  )

  const load = useCallback(async () => {
    const [data, all, shareRows] = await Promise.all([
      api.getTask(taskId),
      api.listTasks({ archived: false }),
      api.listShares(taskId),
    ])
    setDetail(data)
    setDraft(draftFrom(data.task))
    setNotesMode((data.task.description ?? '').trim() ? 'preview' : 'edit')
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
  usePrefetchArtifactBlobs(taskId, detail?.artifacts ?? NO_ARTIFACTS)

  const original = detail ? draftFrom(detail.task) : null
  const dirty =
    draft != null &&
    original != null &&
    (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== original[k])

  const onCommentsChanged = useCallback(async () => {
    await load()
    setActivityTick((n) => n + 1)
  }, [load])

  const save = useCallback(() => {
    if (!detail || !draft || !draft.title.trim()) return
    const saved = draftFrom(detail.task)
    const patch: Record<string, unknown> = {}
    if (draft.title.trim() !== saved.title) patch.title = draft.title.trim()
    if (draft.description !== saved.description) patch.description = draft.description
    if (draft.priority !== saved.priority) patch.priority = draft.priority
    if (draft.due !== saved.due) {
      const due = fromLocalInput(draft.due)
      if (due) {
        patch.due_at = due
        patch.due_horizon = 'exact'
      } else {
        patch.clear_due_at = true
      }
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
      toast(t('savedToast'))
    }, t('errors.save'))
  }, [detail, draft, load, run, setError, taskId, t, toast])

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

  async function changeStatus(next: string) {
    if (!detail) return
    if (next === 'done') {
      const needsDialog =
        detail.task.require_artifact_on_done || Boolean(detail.task.outcome_schema_json)
      if (needsDialog) {
        setCompleteOpen(true)
        return
      }
    }
    let reason: string | undefined
    if (isPauseStatus(next)) {
      const entered = await prompt({
        title: t('statusReasonPrompt.title'),
        description: t('statusReasonPrompt.description', { status: statusLabel(next) }),
        label: t('statusReasonPrompt.label'),
        placeholder: t('statusReasonPrompt.placeholder'),
        confirmLabel: t('statusReasonPrompt.confirm'),
        maxLength: 4000,
        allowEmpty: true,
      })
      if (entered === null) return
      reason = entered || undefined
    }
    void run(async () => {
      await api.setStatus(taskId, next, reason !== undefined ? { reason } : undefined)
      await load()
    }, t('errors.status'))
  }

  function confirmDone(outcome?: Record<string, unknown>) {
    void run(async () => {
      await api.setStatus(taskId, 'done', outcome !== undefined ? { outcome } : undefined)
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

  function applyDueHorizon(choice: HorizonDueChoice) {
    if (!detail || isClosed(detail.task.status)) return
    if (choice === 'exact') {
      dueInputRef.current?.focus()
      dueInputRef.current?.showPicker?.()
      return
    }
    void run(async () => {
      if (choice === 'clear') {
        await api.updateTask(taskId, { clear_due_at: true })
        setDraft((prev) => (prev ? { ...prev, due: '' } : prev))
        toast(t('tasks:horizon.clearedToast'))
      } else {
        const dueAt = dueAtIsoForHorizon(choice as HorizonId)
        await api.updateTask(taskId, {
          due_at: dueAt,
          due_horizon: choice as HorizonId,
        })
        setDraft((prev) => (prev ? { ...prev, due: toLocalInput(dueAt) } : prev))
        toast(t(`tasks:horizon.setToast.${choice}`))
      }
      await load()
    }, t('tasks:horizon.setFailed'))
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
        <DetailSkeleton />
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
  const canAttachArtifacts =
    isOwner ||
    myShare?.role === 'editor' ||
    myShare?.role === 'commentor' ||
    Boolean(status?.permissions.includes('artifacts:write') && myShare == null)
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
              {parentTask.title ? (
                <UserBidiText text={parentTask.title} />
              ) : (
                t('parentFallback', { number: parentTask.number })
              )}
            </Link>
          </>
        )}
        <Icon name="chevronRight" size={12} className="flip-rtl" />
        <span className="mono">#{task.number}</span>
      </nav>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {task.last_error && (
        <Alert>
          <strong>{t('lastError')}</strong>
          {': '}
          {task.last_error}
        </Alert>
      )}
      {task.status_reason && isPauseStatus(task.status) && (
        <Alert tone="warning">
          <strong>{t('statusReason')}</strong>
          {': '}
          {task.status_reason}
        </Alert>
      )}
      {task.archived_at && (
        <Alert
          tone="warning"
          icon="archive"
          action={
            <button type="button" className="btn small" disabled={busy} onClick={toggleArchive}>
              {t('restore')}
            </button>
          }
        >
          {t('archivedNotice', { when: formatRelative(task.archived_at) })}
        </Alert>
      )}

      <header className="detail-header">
        <div className="detail-title-row">
          <textarea
            {...userBidiAttrs(draft.title, 'title-input')}
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
            <TaskLinkShareMenu taskId={task.id} title={task.title} number={task.number} />
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

      <div
        className={sideCollapsed ? 'detail-grid side-collapsed' : 'detail-grid'}
        style={detailGridStyle}
      >
        <div className="detail-main">
          <Section icon="text" title={t('description')} headingId="description-label">
            <div className="notes">
              <div className="notes-toolbar" role="group" aria-label={t('descriptionMode')}>
                <button
                  type="button"
                  className={notesMode === 'edit' ? 'btn small notes-mode active' : 'btn small notes-mode'}
                  aria-pressed={notesMode === 'edit'}
                  onClick={() => setNotesMode('edit')}
                >
                  {t('descriptionEdit')}
                </button>
                <button
                  type="button"
                  className={
                    notesMode === 'preview' ? 'btn small notes-mode active' : 'btn small notes-mode'
                  }
                  aria-pressed={notesMode === 'preview'}
                  onClick={() => setNotesMode('preview')}
                >
                  {t('descriptionPreview')}
                </button>
              </div>
              {notesMode === 'edit' ? (
                <>
                  <textarea
                    {...userBidiAttrs(draft.description)}
                    aria-labelledby="description-label"
                    rows={Math.min(16, Math.max(4, draft.description.split('\n').length + 1))}
                    value={draft.description}
                    onChange={(e) => update('description', e.target.value)}
                    placeholder={t('descriptionPlaceholder')}
                  />
                  <p className="muted small">{t('descriptionMarkdownHint')}</p>
                </>
              ) : (
                <MarkdownView
                  source={draft.description}
                  className="notes-preview"
                  empty={<p className="muted small wm-md-empty">{t('descriptionEmptyPreview')}</p>}
                />
              )}
            </div>
          </Section>
          <CommentsSection
            taskId={taskId}
            artifacts={detail.artifacts}
            tasks={allTasks}
            shares={shares}
            canComment={canComment}
            canAttach={canAttachArtifacts}
            composerOnly
            onChanged={onCommentsChanged}
          />
          <ActivitySection
            taskId={taskId}
            artifacts={detail.artifacts}
            tasksById={tasksById}
            refreshKey={activityTick + detail.events.length + detail.artifacts.length}
            onCommentsChanged={onCommentsChanged}
          />
        </div>

        <aside
          className={sideCollapsed ? 'detail-rail collapsed' : 'detail-rail'}
          aria-label={t('sidePanel')}
        >
          {!sideCollapsed && (
            <div
              className="detail-rail-resize-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label={t('resizeSide')}
              title={t('resizeSide')}
              onPointerDown={onRailResizeStart}
            />
          )}
          <div className="detail-rail-inner">
            <div className="detail-rail-chrome">
              {(!sideCollapsed || railStacked) && (
                <span className="detail-rail-label">{t('sidePanel')}</span>
              )}
              <button
                type="button"
                className="icon-btn sidebar-toggle detail-rail-toggle"
                aria-label={sideCollapsed ? t('expandSide') : t('collapseSide')}
                aria-expanded={!sideCollapsed}
                title={sideCollapsed ? t('expandSide') : t('collapseSide')}
                onClick={() => setSideCollapsed((v) => !v)}
              >
                <Icon
                  name={
                    railStacked
                      ? sideCollapsed
                        ? 'chevronRight'
                        : 'chevronDown'
                      : sideCollapsed
                        ? 'chevronLeft'
                        : 'arrowRight'
                  }
                  size={14}
                  className="flip-rtl"
                />
              </button>
            </div>
            {!sideCollapsed && (
              <>
            <div className="detail-side detail-props">
              <Section icon="sliders" title={t('fields')} className="stack detail-fields" variant="plain">
                <label className="field">
                  <span>{t('status')}</span>
                  <select
                    value={task.status}
                    disabled={busy}
                    aria-label={t('status')}
                    onChange={(e) => {
                      const next = e.target.value
                      if (next !== task.status) changeStatus(next)
                    }}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t('priority')}</span>
                  <select
                    value={draft.priority}
                    onChange={(e) => update('priority', Number(e.target.value))}
                  >
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
                      ref={dueInputRef}
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
                {!isClosed(task.status) && (
                  <HorizonDueChips
                    disabled={busy}
                    exactActive={Boolean(draft.due)}
                    onChoose={applyDueHorizon}
                  />
                )}
                <label className="field">
                  <span>{t('parentTask')}</span>
                  <span className="input-with-action">
                    <select value={draft.parent} onChange={(e) => update('parent', e.target.value)}>
                      <option value="">{t('parentNone')}</option>
                      {parentChoices.map((p) => {
                        const label = `#${p.number} · ${p.title}`
                        return (
                          <option
                            key={p.id}
                            value={p.id}
                            dir={isMixedBidi(label) ? 'rtl' : undefined}
                          >
                            {label}
                          </option>
                        )
                      })}
                      {parentTask && !parentChoices.some((p) => p.id === parentTask.id) && (
                        <option
                          value={parentTask.id}
                          dir={
                            isMixedBidi(
                              `#${parentTask.number} · ${parentTask.title || ''}`,
                            )
                              ? 'rtl'
                              : undefined
                          }
                        >
                          #{parentTask.number} ·{' '}
                          {parentTask.title || t('parentFallback', { number: parentTask.number })}
                        </option>
                      )}
                    </select>
                    {draft.parent && (
                      <Link
                        to={`/tasks/${draft.parent}`}
                        className="icon-btn"
                        aria-label={t('openParent')}
                        title={t('openParent')}
                      >
                        <Icon name="external" />
                      </Link>
                    )}
                  </span>
                </label>
              </Section>

              <SubtasksSection
                taskId={taskId}
                subtasks={detail.children}
                onChanged={load}
                compact
                variant="plain"
                defaultCollapsed={railStacked}
              />
              <ClaimLeaseSection task={task} events={detail.events} variant="plain" />
            </div>

            <div className="detail-side detail-related">
              <LinksSection
                taskId={taskId}
                links={detail.links ?? []}
                tasksById={tasksById}
                onChanged={load}
                variant="plain"
                defaultCollapsed={railStacked}
              />
              <SharingSection
                taskId={taskId}
                shares={shares}
                isOwner={isOwner}
                onChanged={load}
                variant="plain"
                defaultCollapsed={railStacked}
              />
              <CompletionSection
                requireArtifact={draft.requireArtifact}
                schemaText={draft.outcomeSchema}
                onRequireArtifact={(value) => update('requireArtifact', value)}
                onSchemaText={(value) => update('outcomeSchema', value)}
                recordedOutcome={task.outcome_json}
                variant="plain"
                defaultCollapsed={railStacked}
              />
              <ArtifactsSection
                taskId={taskId}
                artifacts={detail.artifacts}
                onChanged={load}
                variant="plain"
                defaultCollapsed={railStacked}
                allowCreate={false}
              />
            </div>
              </>
            )}
          </div>
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

