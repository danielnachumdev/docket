import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, type SavedView, type Task } from '../api'
import { useAuth } from '../auth'
import { DueBadge, PriorityBadge } from '../components/Badges'
import { Alert, EmptyState } from '../components/Feedback'
import { Skeleton } from '../components/Skeleton'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { SortableSiblingItem, SortableSiblingList } from '../components/SortableSiblingList'
import { UserBidiText } from '../components/UserBidiText'
import { userBidiAttrs } from '../lib/bidi'
import { useConfirm, usePrompt } from '../lib/dialogs'
import {
  PRIORITIES,
  STATUSES,
  isClosed,
  isPauseStatus,
  priorityLabel,
  statusLabel,
  type Status,
} from '../lib/format'
import { HorizonDueMenu, type HorizonDueChoice } from '../components/HorizonDueMenu'
import { TaskLinkShareMenu } from '../components/TaskLinkShareMenu'
import {
  dueAtIsoForHorizon,
  groupTasksByDueSection,
  type DueSectionId,
  type HorizonId,
} from '../lib/localDay'
import {
  SMART_FILTERS,
  filterLabel,
  isSmartFilter,
  matchesFilterKey,
  type FilterKey,
} from '../lib/smartFilters'
import { ranksForOrder, reorderBodyAfterMove } from '../lib/taskReorder'
import { useToast } from '../lib/toast'
import { useAction } from '../lib/useAction'
import { useKeyboardShortcut } from '../lib/useKeyboardShortcut'
import { usePreferences } from '../preferences'
import { TaskKanbanBoard } from './TaskKanbanBoard'
import './TaskListPage.css'

type StatusChip = 'active' | 'all' | (typeof STATUSES)[number]

function sortByRank(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => a.rank - b.rank || a.number - b.number)
}

function filterFlat(
  tasks: Task[],
  filter: FilterKey,
  query: string,
  pinned: Set<string>,
  userId: number | null,
): Task[] {
  return tasks.filter((task) => matchesFilterKey(task, filter, { userId, query, pinned }))
}

type RowProps = {
  task: Task
  parent: Task | null
  childCount: number
  childDone: number
  selected: Set<string>
  dragDisabled?: boolean
  onToggleDone: (task: Task) => void
  onStatusChange: (task: Task, status: Status) => void
  onToggleSelect: (id: string) => void
  onToggleUnread: (task: Task) => void
  onDueHorizon: (task: Task, choice: HorizonDueChoice) => void
}

function TaskRow({
  task,
  parent,
  childCount,
  childDone,
  selected,
  dragDisabled = false,
  onToggleDone,
  onStatusChange,
  onToggleSelect,
  onToggleUnread,
  onDueHorizon,
}: RowProps) {
  const { t } = useTranslation('tasks')
  const closed = isClosed(task.status)
  const done = task.status === 'done'
  const unread = Boolean(task.unread)
  const shared = Boolean(task.shared)
  const hasDue = Boolean(task.due_at)
  const isSelected = selected.has(task.id)
  const hasParent = parent != null
  const rowClass = closed ? 'task-row closed' : 'task-row'

  return (
    <SortableSiblingItem id={task.id} disabled={dragDisabled}>
      {({ dragHandle, setNodeRef, style, isDragging }) => (
        <li
          className={isDragging ? 'task-node dragging' : 'task-node'}
          ref={setNodeRef}
          style={style}
        >
          <div className={rowClass}>
            {dragDisabled ? <span className="drag-handle-spacer" aria-hidden="true" /> : dragHandle}
            <input
              type="checkbox"
              className="task-select"
              checked={isSelected}
              onChange={() => onToggleSelect(task.id)}
              aria-label={t('selectTask', { title: task.title })}
            />
            <button
              type="button"
              className={`check status-${task.status}`}
              aria-label={done ? t('reopenTask', { title: task.title }) : t('markDone', { title: task.title })}
              title={done ? t('reopenShort') : t('markDoneShort')}
              onClick={() => onToggleDone(task)}
            >
              <Icon name="check" size={12} />
            </button>
            <div className="task-main">
              <Link to={`/tasks/${task.id}`} className="task-title-row">
                {unread && <span className="unread-dot" aria-hidden="true" />}
                {shared && (
                  <span className="shared-mark" title={t('shared')} aria-label={t('shared')}>
                    <Icon name="users" size={12} />
                  </span>
                )}
                <UserBidiText
                  text={task.title}
                  className={unread ? 'task-title unread' : 'task-title'}
                />
              </Link>
              <span className="task-meta">
                <span className="meta-item mono task-number">#{task.number}</span>
                <PriorityBadge priority={task.priority} />
                <DueBadge due={task.due_at} closed={closed} />
                {childCount > 0 && (
                  <span className="meta-item" title={t('subtasksDone')}>
                    <Icon name="subtasks" size={13} />
                    {childDone}/{childCount}
                  </span>
                )}
                {hasParent && (
                  <Link
                    to={`/tasks/${parent.id}`}
                    className="parent-chip"
                    title={t('subtaskOf', { number: parent.number, title: parent.title })}
                  >
                    <Icon name="subtasks" size={12} />
                    {t('subtaskOfShort', { number: parent.number })}
                  </Link>
                )}
              </span>
            </div>
            <div className="task-row-end">
              <div className="task-row-end-top">
                <TaskLinkShareMenu
                  taskId={task.id}
                  title={task.title}
                  number={task.number}
                  className="link-share-toggle"
                  label={t('linkShare.buttonNamed', { title: task.title })}
                />
                <button
                  type="button"
                  className={
                    unread ? 'icon-btn ghost unread-toggle active' : 'icon-btn ghost unread-toggle'
                  }
                  aria-label={
                    unread
                      ? t('markReadNamed', { title: task.title })
                      : t('markUnreadNamed', { title: task.title })
                  }
                  aria-pressed={unread}
                  title={unread ? t('markRead') : t('markUnread')}
                  onClick={() => onToggleUnread(task)}
                >
                  <Icon name={unread ? 'mail' : 'mailOpen'} size={14} />
                </button>
                {task.status_reason && isPauseStatus(task.status) && (
                  <UserBidiText
                    text={task.status_reason}
                    className={`status-reason status-${task.status}`}
                    title={t('statusReasonHint', { reason: task.status_reason })}
                  />
                )}
                <label
                  className={`task-status status-badge status-select status-${task.status}`}
                  title={t('changeStatus')}
                >
                  <span className="status-dot" aria-hidden="true" />
                  <select
                    value={task.status}
                    onChange={(e) => onStatusChange(task, e.target.value as Status)}
                    aria-label={t('changeStatusNamed', { title: task.title })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                  <Icon name="chevronDown" size={12} />
                </label>
              </div>
              {!closed && (
                <HorizonDueMenu
                  label={t('horizon.setNamed', { title: task.title })}
                  hasDue={hasDue}
                  className={hasDue ? 'due-horizon-toggle active' : 'due-horizon-toggle'}
                  omitExact
                  onChoose={(choice) => onDueHorizon(task, choice)}
                />
              )}
            </div>
          </div>
        </li>
      )}
    </SortableSiblingItem>
  )
}

function sectionLabel(t: (key: string) => string, id: DueSectionId): string {
  return t(`dueSection.${id}`)
}

export function TaskListPage() {
  const { t } = useTranslation(['tasks', 'common', 'domain', 'detail'])
  const [searchParams, setSearchParams] = useSearchParams()
  const archived = searchParams.get('view') === 'archived'
  const layout = searchParams.get('layout') === 'kanban' ? 'kanban' : 'list'
  const { status: auth } = useAuth()
  const { taskSortMode, setTaskSortMode } = usePreferences()
  const userId = auth?.user?.id ?? null
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [filter, setFilter] = useState<FilterKey>('active')
  const [activeSavedId, setActiveSavedId] = useState<number | null>(null)
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [query, setQuery] = useState('')
  // Tasks toggled in this view stay visible so a mis-click can be undone.
  const [pinned, setPinned] = useState<Set<string>>(() => new Set())
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState(3)
  const { busy, error, setError, run } = useAction()
  const confirm = useConfirm()
  const prompt = usePrompt()
  const toast = useToast()
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLInputElement>(null)
  const dateMode = layout === 'list' && taskSortMode === 'date'

  useKeyboardShortcut('/', () => searchRef.current?.focus())
  useKeyboardShortcut('n', () => composerRef.current?.focus(), !archived)

  function setLayout(next: 'list' | 'kanban') {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next === 'kanban') params.set('layout', 'kanban')
        else params.delete('layout')
        return params
      },
      { replace: true },
    )
  }

  const load = useCallback(async () => {
    const rows = await api.listTasks({ archived })
    setTasks(rows)
  }, [archived])

  const loadViews = useCallback(async () => {
    if (archived) {
      setSavedViews([])
      return
    }
    const rows = await api.listSavedViews()
    setSavedViews(rows)
  }, [archived])

  useEffect(() => {
    setTasks(null)
    setFilter(archived ? 'all' : 'active')
    setActiveSavedId(null)
    setPinned(new Set())
    setSelected(new Set())
    load().catch((err: Error) => setError(err.message))
    loadViews().catch((err: Error) => setError(err.message))
  }, [archived, load, loadViews, setError])

  const ranked = useMemo(() => sortByRank(tasks ?? []), [tasks])
  const visible = useMemo(
    () => filterFlat(ranked, filter, query.trim().toLowerCase(), pinned, userId),
    [ranked, filter, query, pinned, userId],
  )
  const visibleIds = useMemo(() => visible.map((task) => task.id), [visible])
  const dateSections = useMemo(
    () => (dateMode ? groupTasksByDueSection(visible) : []),
    [dateMode, visible],
  )
  const boardTasks = visible
  const byId = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t])), [tasks])
  const childrenById = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks ?? []) {
      if (t.parent_task_id == null) continue
      const list = map.get(t.parent_task_id) ?? []
      list.push(t)
      map.set(t.parent_task_id, list)
    }
    return map
  }, [tasks])
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, active: 0 }
    for (const t of tasks ?? []) {
      c.all = (c.all ?? 0) + 1
      if (!isClosed(t.status)) c.active = (c.active ?? 0) + 1
      c[t.status] = (c[t.status] ?? 0) + 1
    }
    for (const key of SMART_FILTERS) {
      c[key] = (tasks ?? []).filter((t) =>
        matchesFilterKey(t, key, {
          userId,
          query: '',
          pinned: new Set(),
        }),
      ).length
    }
    return c
  }, [tasks, userId])

  function selectFilter(next: FilterKey, savedId: number | null = null) {
    setFilter(next)
    setActiveSavedId(savedId)
    setPinned(new Set())
  }

  function selectSavedView(view: SavedView) {
    const key = (isSmartFilter(view.filter_key) ||
    view.filter_key === 'active' ||
    view.filter_key === 'all' ||
    (STATUSES as readonly string[]).includes(view.filter_key)
      ? view.filter_key
      : 'active') as FilterKey
    setQuery(view.query)
    selectFilter(key, view.id)
  }

  const selectedCount = selected.size
  useKeyboardShortcut('Escape', () => setSelected(new Set()), selectedCount > 0)
  const selecting = selectMode || selectedCount > 0
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))

  function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    void run(async () => {
      const created = await api.createTask({ title: title.trim(), priority })
      setTitle('')
      setPinned((prev) => new Set(prev).add(created.id))
      await load()
      toast({
        message: t('tasks:createdToast', { number: created.number }),
        action: { label: t('common:open'), onSelect: () => navigate(`/tasks/${created.id}`) },
      })
    }, t('tasks:createFailed'))
  }

  async function onSaveView() {
    const name = await prompt({
      title: t('tasks:saveView'),
      description: t('tasks:saveViewHint'),
      label: t('tasks:saveViewPrompt'),
      placeholder: t('tasks:saveViewPlaceholder'),
      confirmLabel: t('common:save'),
      maxLength: 80,
    })
    if (!name) return
    void run(async () => {
      const created = await api.createSavedView({
        name,
        filter_key: filter,
        query: query.trim(),
        position: savedViews.length,
      })
      setSavedViews((prev) => [...prev, created])
      setActiveSavedId(created.id)
    }, t('tasks:saveViewFailed'))
  }

  async function onDeleteSavedView(view: SavedView) {
    const ok = await confirm({
      title: t('tasks:deleteSavedViewTitle'),
      description: t('tasks:deleteSavedViewConfirm', { name: view.name }),
      confirmLabel: t('common:delete'),
      danger: true,
    })
    if (!ok) return
    void run(async () => {
      await api.deleteSavedView(view.id)
      setSavedViews((prev) => prev.filter((v) => v.id !== view.id))
      if (activeSavedId === view.id) setActiveSavedId(null)
    }, t('tasks:deleteViewFailed'))
  }

  function toggleDone(task: Task) {
    const next = task.status === 'done' ? 'backlog' : 'done'
    applyStatus(task, next)
  }

  async function applyStatus(task: Task, next: Status) {
    let reason: string | undefined
    if (isPauseStatus(next)) {
      const entered = await prompt({
        title: t('detail:statusReasonPrompt.title'),
        description: t('detail:statusReasonPrompt.description', {
          status: statusLabel(next),
        }),
        label: t('detail:statusReasonPrompt.label'),
        placeholder: t('detail:statusReasonPrompt.placeholder'),
        confirmLabel: t('detail:statusReasonPrompt.confirm'),
        maxLength: 4000,
        allowEmpty: true,
      })
      if (entered === null) return
      reason = entered || undefined
    }
    const statusReason = isPauseStatus(next) ? (reason ?? null) : null
    setPinned((prev) => new Set(prev).add(task.id))
    setTasks(
      (prev) =>
        prev?.map((t) =>
          t.id === task.id
            ? { ...t, status: next, status_reason: statusReason, unread: true }
            : t,
        ) ?? null,
    )
    api
      .setStatus(task.id, next, reason !== undefined ? { reason } : undefined)
      .catch((err: Error) => {
        setError(err.message)
        void load()
      })
  }

  function toggleUnread(task: Task) {
    const next = !task.unread
    setTasks((prev) => prev?.map((t) => (t.id === task.id ? { ...t, unread: next } : t)) ?? null)
    const req = next ? api.markTaskUnread(task.id) : api.markTaskRead(task.id)
    req.catch((err: Error) => {
      setError(err.message)
      void load()
    })
  }

  function applyDueHorizon(task: Task, choice: HorizonDueChoice) {
    if (isClosed(task.status)) return
    if (choice === 'exact') {
      navigate(`/tasks/${task.id}`)
      return
    }
    const patch =
      choice === 'clear'
        ? { clear_due_at: true as const }
        : {
            due_at: dueAtIsoForHorizon(choice as HorizonId),
            due_horizon: choice as HorizonId,
          }
    const optimisticDue = choice === 'clear' ? null : patch.due_at!
    const optimisticHorizon = choice === 'clear' ? null : (choice as HorizonId)
    setPinned((prev) => new Set(prev).add(task.id))
    setTasks(
      (prev) =>
        prev?.map((row) =>
          row.id === task.id
            ? { ...row, due_at: optimisticDue, due_horizon: optimisticHorizon }
            : row,
        ) ?? null,
    )
    api
      .updateTask(task.id, patch)
      .then((updated) => {
        setTasks((prev) => prev?.map((row) => (row.id === updated.id ? updated : row)) ?? null)
        toast(
          choice === 'clear'
            ? t('tasks:horizon.clearedToast')
            : t(`tasks:horizon.setToast.${choice}`),
        )
      })
      .catch((err: Error) => {
        setError(err.message || t('tasks:horizon.setFailed'))
        void load()
      })
  }

  function renderTaskRow(task: Task) {
    const kids = childrenById.get(task.id) ?? []
    const parent =
      task.parent_task_id != null ? (byId.get(task.parent_task_id) ?? null) : null
    return (
      <TaskRow
        key={task.id}
        task={task}
        parent={parent}
        childCount={kids.length}
        childDone={kids.filter((k) => k.status === 'done').length}
        selected={selected}
        dragDisabled={dateMode}
        onToggleDone={toggleDone}
        onStatusChange={applyStatus}
        onToggleSelect={toggleSelect}
        onToggleUnread={toggleUnread}
        onDueHorizon={applyDueHorizon}
      />
    )
  }

  function reorderQueue(activeId: string, orderedIds: string[]) {
    const ranks = ranksForOrder(orderedIds)
    setTasks(
      (prev) =>
        prev?.map((t) => (ranks.has(t.id) ? { ...t, rank: ranks.get(t.id)! } : t)) ?? null,
    )
    const body = reorderBodyAfterMove(orderedIds, activeId)
    api.reorderTask(activeId, body).catch((err: Error) => {
      setError(err.message)
      void load()
    })
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllVisible() {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev)
        for (const id of visibleIds) next.delete(id)
        return next
      }
      const next = new Set(prev)
      for (const id of visibleIds) next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  function toggleSelectMode() {
    if (selecting) {
      clearSelection()
      setSelectMode(false)
    } else {
      setSelectMode(true)
    }
  }

  function applyBulk(patch: { status?: string; priority?: number }) {
    const taskIds = [...selected]
    if (taskIds.length === 0) return
    void run(async () => {
      const updated = await api.bulkUpdateTasks({ task_ids: taskIds, ...patch })
      const byId = new Map(updated.map((t) => [t.id, t]))
      setTasks((prev) => prev?.map((t) => byId.get(t.id) ?? t) ?? null)
      setPinned((prev) => {
        const next = new Set(prev)
        for (const id of taskIds) next.add(id)
        return next
      })
      clearSelection()
      toast(t('tasks:bulkUpdatedToast', { count: updated.length }))
    }, t('tasks:bulkUpdateFailed'))
  }

  function applyBulkUnread(unread: boolean) {
    const taskIds = [...selected]
    if (taskIds.length === 0) return
    setTasks(
      (prev) =>
        prev?.map((t) => (selected.has(t.id) ? { ...t, unread } : t)) ?? null,
    )
    setPinned((prev) => {
      const next = new Set(prev)
      for (const id of taskIds) next.add(id)
      return next
    })
    void run(async () => {
      try {
        const updated = await api.bulkUpdateTasks({ task_ids: taskIds, unread })
        const byId = new Map(updated.map((t) => [t.id, t]))
        setTasks((prev) => prev?.map((t) => byId.get(t.id) ?? t) ?? null)
        clearSelection()
      } catch (err) {
        await load()
        throw err
      }
    }, t('tasks:bulkUpdateFailed'))
  }

  const isChipSelected = (key: FilterKey) => activeSavedId == null && filter === key
  const statusChips = (['active', 'all', ...STATUSES] as StatusChip[]).filter(
    (key) => key === 'active' || key === 'all' || (counts[key] ?? 0) > 0 || isChipSelected(key),
  )
  const smartChips = SMART_FILTERS.filter((key) => (counts[key] ?? 0) > 0 || isChipSelected(key))
  const filtersNarrowed = query.trim() !== '' || filter !== (archived ? 'all' : 'active')

  function resetFilters() {
    setQuery('')
    selectFilter(archived ? 'all' : 'active')
  }

  const selectModeButton = (
    <button
      type="button"
      className="btn ghost small select-mode-btn"
      aria-pressed={selecting}
      onClick={toggleSelectMode}
    >
      <Icon name={selecting ? 'x' : 'check'} size={14} />
      {selecting ? t('tasks:selectModeDone') : t('tasks:selectMode')}
    </button>
  )

  return (
    <main
      className={[
        'page',
        layout === 'kanban' ? 'wide' : '',
        selectedCount > 0 ? 'has-bulkbar' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <PageHeader
        title={archived ? t('tasks:archivedTitle') : t('tasks:title')}
        subtitle={
          tasks == null
            ? t('common:loadingEllipsis')
            : archived
              ? t('tasks:archivedCount', { count: counts.all })
              : t('tasks:activeDoneSummary', {
                  active: counts.active,
                  done: counts.done ?? 0,
                })
        }
        actions={
          <div className="list-header-actions">
            {layout === 'list' && (
              <div className="segmented" role="radiogroup" aria-label={t('tasks:sortMode')}>
                {(['custom', 'date'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={taskSortMode === mode}
                    className={taskSortMode === mode ? 'active' : ''}
                    title={mode === 'custom' ? t('tasks:sortCustom') : t('tasks:sortDate')}
                    onClick={() => setTaskSortMode(mode)}
                  >
                    <Icon name={mode === 'custom' ? 'list' : 'calendar'} size={14} />
                    <span className="hide-narrow">
                      {mode === 'custom' ? t('tasks:sortCustom') : t('tasks:sortDate')}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="segmented" role="radiogroup" aria-label={t('tasks:layout')}>
              {(['list', 'kanban'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={layout === mode}
                  className={layout === mode ? 'active' : ''}
                  title={mode === 'list' ? t('tasks:list') : t('tasks:board')}
                  onClick={() => setLayout(mode)}
                >
                  <Icon name={mode === 'list' ? 'list' : 'columns'} size={14} />
                  <span className="hide-narrow">
                    {mode === 'list' ? t('tasks:list') : t('tasks:board')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        }
      />

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {!archived && (
        <form className="composer" onSubmit={onCreate}>
          <Icon name="plus" size={18} className="composer-icon" />
          <input
            ref={composerRef}
            type="text"
            placeholder={t('tasks:addPlaceholder')}
            aria-label={t('tasks:newTaskTitle')}
            aria-keyshortcuts="N"
            title={t('tasks:composerShortcut')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') e.currentTarget.blur()
            }}
            required
            {...userBidiAttrs(title)}
          />
          <select
            className="compact-select"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            aria-label={t('tasks:priority')}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {priorityLabel(p)}
              </option>
            ))}
          </select>
          <button type="submit" className="btn primary" disabled={busy || !title.trim()}>
            {t('common:add')}
          </button>
        </form>
      )}

      <div className="toolbar">
        <label className="search">
          <Icon name="search" />
          <input
            ref={searchRef}
            type="search"
            placeholder={t('tasks:searchPlaceholder')}
            aria-label={t('tasks:searchPlaceholder')}
            aria-keyshortcuts="/"
            title={t('tasks:searchShortcut')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveSavedId(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('')
                e.currentTarget.blur()
              }
            }}
          />
          {!query && (
            <kbd className="kbd-hint" aria-hidden="true">
              /
            </kbd>
          )}
        </label>
        <div className="chips" role="tablist" aria-label={t('tasks:filterByStatus')}>
          {statusChips.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={isChipSelected(f)}
              className={isChipSelected(f) ? 'chip active' : 'chip'}
              onClick={() => selectFilter(f)}
            >
              {filterLabel(f)}
              <span className="chip-count">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {!archived && (
        <div className="views-bar" aria-label={t('tasks:smartAndSavedViews')}>
          <div className="chips views-chips" role="tablist" aria-label={t('tasks:smartFilters')}>
            {smartChips.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={isChipSelected(f)}
                className={isChipSelected(f) ? 'chip smart active' : 'chip smart'}
                onClick={() => selectFilter(f)}
              >
                {filterLabel(f)}
                <span className="chip-count">{counts[f] ?? 0}</span>
              </button>
            ))}
            {savedViews.map((view) => (
              <span key={view.id} className="saved-chip-wrap">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSavedId === view.id}
                  className={activeSavedId === view.id ? 'chip saved active' : 'chip saved'}
                  onClick={() => selectSavedView(view)}
                >
                  {view.name}
                </button>
                <button
                  type="button"
                  className="icon-btn ghost chip-remove"
                  aria-label={t('tasks:deleteSavedViewNamed', { name: view.name })}
                  title={t('tasks:deleteSavedView')}
                  onClick={() => void onDeleteSavedView(view)}
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            className="btn ghost small save-view-btn"
            disabled={busy}
            onClick={() => void onSaveView()}
          >
            <Icon name="plus" size={14} />
            {t('tasks:saveView')}
          </button>
          {layout === 'list' && visibleIds.length > 0 && selectModeButton}
        </div>
      )}

      {tasks == null ? (
        <Skeleton rows={6} leading="check" trailing />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={tasks.length > 0 ? 'search' : archived ? 'archive' : 'inbox'}
          title={
            tasks.length === 0
              ? archived
                ? t('tasks:emptyNoneArchived')
                : t('tasks:emptyNoneYet')
              : t('tasks:emptyNoMatch')
          }
          action={
            tasks.length > 0 && filtersNarrowed ? (
              <button type="button" className="btn" onClick={resetFilters}>
                <Icon name="x" />
                {t('tasks:clearFilters')}
              </button>
            ) : tasks.length === 0 && !archived ? (
              <button
                type="button"
                className="btn primary"
                onClick={() => composerRef.current?.focus()}
              >
                <Icon name="plus" />
                {t('tasks:addFirstTask')}
              </button>
            ) : null
          }
        >
          {tasks.length === 0
            ? archived
              ? t('tasks:emptyNoneArchivedHint')
              : t('tasks:emptyNoneYetHint')
            : t('tasks:emptyNoMatchHint')}
        </EmptyState>
      ) : layout === 'kanban' ? (
        <TaskKanbanBoard tasks={boardTasks} onStatusChange={applyStatus} />
      ) : (
        <>
          <div className={selecting ? 'select-bar selecting' : 'select-bar'}>
            <label className="select-all">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                aria-label={t('tasks:selectAllVisible')}
              />
              <span>
                {selectedCount > 0
                  ? t('tasks:selectedCount', { count: selectedCount })
                  : t('tasks:selectTasks')}
              </span>
            </label>
            {archived && selectModeButton}
          </div>
          {dateMode ? (
            <div className={selecting ? 'task-tree selecting date-sections' : 'task-tree date-sections'}>
              {dateSections.map((section) => (
                <section key={section.id} className="due-section" aria-label={sectionLabel(t, section.id)}>
                  <h2 className="due-section-title">{sectionLabel(t, section.id)}</h2>
                  <SortableSiblingList
                    ids={section.tasks.map((task) => task.id)}
                    className="due-section-list"
                    onReorder={reorderQueue}
                  >
                    {section.tasks.map((task) => renderTaskRow(task))}
                  </SortableSiblingList>
                </section>
              ))}
            </div>
          ) : (
            <SortableSiblingList
              ids={visibleIds}
              className={selecting ? 'task-tree selecting' : 'task-tree'}
              onReorder={reorderQueue}
            >
              {visible.map((task) => renderTaskRow(task))}
            </SortableSiblingList>
          )}
        </>
      )}

      {selectedCount > 0 && (
        <div className="bulkbar" role="toolbar" aria-label={t('tasks:bulkActions')}>
          <span className="bulkbar-count">
            {t('tasks:selectedCount', { count: selectedCount })}
          </span>
          <div className="bulkbar-actions">
            <select
              className="compact-select"
              value=""
              disabled={busy}
              onChange={(e) => e.target.value && applyBulk({ status: e.target.value })}
              aria-label={t('tasks:bulkStatus')}
            >
              <option value="" disabled>
                {t('tasks:setStatusPlaceholder')}
              </option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            <select
              className="compact-select"
              value=""
              disabled={busy}
              onChange={(e) => e.target.value && applyBulk({ priority: Number(e.target.value) })}
              aria-label={t('tasks:bulkPriority')}
            >
              <option value="" disabled>
                {t('tasks:setPriorityPlaceholder')}
              </option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel(p)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-btn"
              disabled={busy}
              aria-label={t('tasks:markRead')}
              title={t('tasks:markRead')}
              onClick={() => applyBulkUnread(false)}
            >
              <Icon name="mailOpen" />
            </button>
            <button
              type="button"
              className="icon-btn"
              disabled={busy}
              aria-label={t('tasks:markUnread')}
              title={t('tasks:markUnread')}
              onClick={() => applyBulkUnread(true)}
            >
              <Icon name="mail" />
            </button>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('common:clear')}
            title={t('common:clear')}
            onClick={clearSelection}
          >
            <Icon name="x" />
          </button>
        </div>
      )}
    </main>
  )
}
