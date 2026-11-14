import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type SavedView, type Task } from '../api'
import { useAuth } from '../auth'
import { DueBadge, PriorityBadge, StatusBadge } from '../components/Badges'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { SortableSiblingItem, SortableSiblingList } from '../components/SortableSiblingList'
import {
  PRIORITIES,
  STATUSES,
  isClosed,
  priorityLabel,
  statusLabel,
  type Status,
} from '../lib/format'
import {
  SMART_FILTERS,
  filterLabel,
  isSmartFilter,
  matchesFilterKey,
  type FilterKey,
} from '../lib/smartFilters'
import { ranksForOrder, reorderBodyAfterMove } from '../lib/taskReorder'
import { useAction } from '../lib/useAction'
import { TaskKanbanBoard } from './TaskKanbanBoard'

type TaskNode = Task & { children: TaskNode[] }
type StatusChip = 'active' | 'all' | (typeof STATUSES)[number]

function nestTasks(tasks: Task[]): TaskNode[] {
  const byId = new Map<string, TaskNode>()
  for (const t of tasks) {
    byId.set(t.id, { ...t, children: [] })
  }
  const roots: TaskNode[] = []
  for (const node of byId.values()) {
    const parent = node.parent_task_id != null ? byId.get(node.parent_task_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sortNodes = (nodes: TaskNode[]) => {
    nodes.sort((a, b) => a.rank - b.rank || a.number - b.number)
    for (const n of nodes) sortNodes(n.children)
  }
  sortNodes(roots)
  return roots
}

function filterTree(
  nodes: TaskNode[],
  filter: FilterKey,
  query: string,
  pinned: Set<string>,
  userId: number | null,
): TaskNode[] {
  const out: TaskNode[] = []
  for (const node of nodes) {
    const children = filterTree(node.children, filter, query, pinned, userId)
    if (
      children.length > 0 ||
      matchesFilterKey(node, filter, { userId, query, pinned })
    ) {
      out.push({ ...node, children })
    }
  }
  return out
}

function collectIds(nodes: TaskNode[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    ids.push(node.id)
    ids.push(...collectIds(node.children))
  }
  return ids
}

type RowProps = {
  task: TaskNode
  totalChildren: Map<string, Task[]>
  collapsed: Set<string>
  selected: Set<string>
  onToggleCollapse: (id: string) => void
  onToggleDone: (task: Task) => void
  onToggleSelect: (id: string) => void
  onToggleUnread: (task: Task) => void
  onReorderSiblings: (activeId: string, orderedIds: string[]) => void
}

function TaskRow({
  task,
  totalChildren,
  collapsed,
  selected,
  onToggleCollapse,
  onToggleDone,
  onToggleSelect,
  onToggleUnread,
  onReorderSiblings,
}: RowProps) {
  const { t } = useTranslation('tasks')
  const closed = isClosed(task.status)
  const done = task.status === 'done'
  const unread = Boolean(task.unread)
  const shared = Boolean(task.shared)
  const kids = totalChildren.get(task.id) ?? []
  const kidsDone = kids.filter((k) => k.status === 'done').length
  const isCollapsed = collapsed.has(task.id)
  const isSelected = selected.has(task.id)
  const childIds = task.children.map((child) => child.id)

  return (
    <SortableSiblingItem id={task.id}>
      {({ dragHandle, setNodeRef, style, isDragging }) => (
        <li
          className={isDragging ? 'task-node dragging' : 'task-node'}
          ref={setNodeRef}
          style={style}
        >
          <div className={closed ? 'task-row closed' : 'task-row'}>
            {dragHandle}
            <input
              type="checkbox"
              className="task-select"
              checked={isSelected}
              onChange={() => onToggleSelect(task.id)}
              aria-label={t('selectTask', { title: task.title })}
            />
            {task.children.length > 0 ? (
              <button
                type="button"
                className="icon-btn ghost expand"
                aria-label={isCollapsed ? t('expandSubtasks') : t('collapseSubtasks')}
                aria-expanded={!isCollapsed}
                onClick={() => onToggleCollapse(task.id)}
              >
                <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={14} />
              </button>
            ) : (
              <span className="expand-spacer" />
            )}
            <button
              type="button"
              className={`check status-${task.status}`}
              aria-label={done ? t('reopenTask', { title: task.title }) : t('markDone', { title: task.title })}
              title={done ? t('reopenShort') : t('markDoneShort')}
              onClick={() => onToggleDone(task)}
            >
              <Icon name="check" size={12} />
            </button>
            <Link to={`/tasks/${task.id}`} className="task-main">
              <span className="task-title-row">
                {unread && <span className="unread-dot" aria-hidden="true" />}
                {shared && (
                  <span className="shared-mark" title={t('shared')} aria-label={t('shared')}>
                    <Icon name="users" size={12} />
                  </span>
                )}
                <span className={unread ? 'task-title unread' : 'task-title'}>{task.title}</span>
              </span>
              <span className="task-meta">
                <PriorityBadge priority={task.priority} />
                <DueBadge due={task.due_at} closed={closed} />
                {kids.length > 0 && (
                  <span className="meta-item" title={t('subtasksDone')}>
                    <Icon name="subtasks" size={13} />
                    {kidsDone}/{kids.length}
                  </span>
                )}
                <span className="meta-item mono">#{task.number}</span>
              </span>
            </Link>
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
            <span className="task-status">
              <StatusBadge status={task.status} />
            </span>
          </div>
          {task.children.length > 0 && !isCollapsed && (
            <SortableSiblingList
              ids={childIds}
              className="task-children"
              onReorder={onReorderSiblings}
            >
              {task.children.map((child) => (
                <TaskRow
                  key={child.id}
                  task={child}
                  totalChildren={totalChildren}
                  collapsed={collapsed}
                  selected={selected}
                  onToggleCollapse={onToggleCollapse}
                  onToggleDone={onToggleDone}
                  onToggleSelect={onToggleSelect}
                  onToggleUnread={onToggleUnread}
                  onReorderSiblings={onReorderSiblings}
                />
              ))}
            </SortableSiblingList>
          )}
        </li>
      )}
    </SortableSiblingItem>
  )
}

export function TaskListPage() {
  const { t } = useTranslation(['tasks', 'common', 'domain'])
  const [searchParams, setSearchParams] = useSearchParams()
  const archived = searchParams.get('view') === 'archived'
  const layout = searchParams.get('layout') === 'kanban' ? 'kanban' : 'list'
  const { status: auth } = useAuth()
  const userId = auth?.user?.id ?? null
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [filter, setFilter] = useState<FilterKey>('active')
  const [activeSavedId, setActiveSavedId] = useState<number | null>(null)
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  // Tasks toggled in this view stay visible so a mis-click can be undone.
  const [pinned, setPinned] = useState<Set<string>>(() => new Set())
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [bulkStatus, setBulkStatus] = useState<(typeof STATUSES)[number]>('on_hold')
  const [bulkPriority, setBulkPriority] = useState(3)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState(3)
  const { busy, error, setError, run } = useAction()

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

  const tree = useMemo(() => nestTasks(tasks ?? []), [tasks])
  const visible = useMemo(
    () => filterTree(tree, filter, query.trim().toLowerCase(), pinned, userId),
    [tree, filter, query, pinned, userId],
  )
  const visibleIds = useMemo(() => collectIds(visible), [visible])
  const boardTasks = useMemo(() => {
    if (tasks == null) return []
    const byId = new Map(tasks.map((t) => [t.id, t]))
    return visibleIds.map((id) => byId.get(id)).filter((t): t is Task => t != null)
  }, [tasks, visibleIds])
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
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))

  function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    void run(async () => {
      await api.createTask({ title: title.trim(), priority })
      setTitle('')
      await load()
    }, t('tasks:createFailed'))
  }

  function onSaveView() {
    const name = window.prompt(t('tasks:saveViewPrompt'))
    if (!name?.trim()) return
    void run(async () => {
      const created = await api.createSavedView({
        name: name.trim(),
        filter_key: filter,
        query: query.trim(),
        position: savedViews.length,
      })
      setSavedViews((prev) => [...prev, created])
      setActiveSavedId(created.id)
    }, t('tasks:saveViewFailed'))
  }

  function onDeleteSavedView(view: SavedView) {
    if (!window.confirm(t('tasks:deleteSavedViewConfirm', { name: view.name }))) return
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

  function applyStatus(task: Task, next: Status) {
    setPinned((prev) => new Set(prev).add(task.id))
    setTasks(
      (prev) =>
        prev?.map((t) => (t.id === task.id ? { ...t, status: next, unread: true } : t)) ?? null,
    )
    api.setStatus(task.id, next).catch((err: Error) => {
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

  function reorderSiblings(activeId: string, orderedIds: string[]) {
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

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
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
        const updated = await Promise.all(
          taskIds.map((id) => (unread ? api.markTaskUnread(id) : api.markTaskRead(id))),
        )
        const byId = new Map(updated.map((t) => [t.id, t]))
        setTasks((prev) => prev?.map((t) => byId.get(t.id) ?? t) ?? null)
        clearSelection()
      } catch (err) {
        await load()
        throw err
      }
    }, t('tasks:bulkUpdateFailed'))
  }

  const statusChips: StatusChip[] = ['active', 'all', ...STATUSES]

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
      <header className="page-header">
        <div>
          <h1>{archived ? t('tasks:archivedTitle') : t('tasks:title')}</h1>
          <p className="muted">
            {tasks == null
              ? t('common:loadingEllipsis')
              : archived
                ? t('tasks:archivedCount', { count: counts.all })
                : t('tasks:activeDoneSummary', {
                    active: counts.active,
                    done: counts.done ?? 0,
                  })}
          </p>
        </div>
        <div className="layout-toggle" role="group" aria-label={t('tasks:layout')}>
          <button
            type="button"
            className={layout === 'list' ? 'btn small active' : 'btn ghost small'}
            aria-pressed={layout === 'list'}
            onClick={() => setLayout('list')}
          >
            <Icon name="list" size={14} />
            {t('tasks:list')}
          </button>
          <button
            type="button"
            className={layout === 'kanban' ? 'btn small active' : 'btn ghost small'}
            aria-pressed={layout === 'kanban'}
            onClick={() => setLayout('kanban')}
          >
            <Icon name="columns" size={14} />
            {t('tasks:board')}
          </button>
        </div>
      </header>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {!archived && (
        <form className="composer" onSubmit={onCreate}>
          <Icon name="plus" size={18} className="composer-icon" />
          <input
            type="text"
            placeholder={t('tasks:addPlaceholder')}
            aria-label={t('tasks:newTaskTitle')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
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
            type="search"
            placeholder={t('tasks:searchPlaceholder')}
            aria-label={t('tasks:searchPlaceholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveSavedId(null)
            }}
          />
        </label>
        <div className="chips" role="tablist" aria-label={t('tasks:filterByStatus')}>
          {statusChips.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={activeSavedId == null && filter === f}
              className={activeSavedId == null && filter === f ? 'chip active' : 'chip'}
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
            {SMART_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={activeSavedId == null && filter === f}
                className={
                  activeSavedId == null && filter === f ? 'chip smart active' : 'chip smart'
                }
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
                  onClick={() => onDeleteSavedView(view)}
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            className="btn ghost save-view-btn"
            disabled={busy}
            onClick={onSaveView}
          >
            {t('tasks:saveView')}
          </button>
        </div>
      )}

      {tasks == null ? (
        <Skeleton rows={5} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={archived ? 'archive' : 'inbox'}
          title={
            tasks.length === 0
              ? archived
                ? t('tasks:emptyNoneArchived')
                : t('tasks:emptyNoneYet')
              : t('tasks:emptyNoMatch')
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
          <div className="select-bar">
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
          </div>
          <SortableSiblingList
            ids={visible.map((task) => task.id)}
            className="task-tree"
            onReorder={reorderSiblings}
          >
            {visible.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                totalChildren={childrenById}
                collapsed={collapsed}
                selected={selected}
                onToggleCollapse={toggleCollapse}
                onToggleDone={toggleDone}
                onToggleSelect={toggleSelect}
                onToggleUnread={toggleUnread}
                onReorderSiblings={reorderSiblings}
              />
            ))}
          </SortableSiblingList>
        </>
      )}

      {selectedCount > 0 && (
        <div className="bulkbar" role="toolbar" aria-label={t('tasks:bulkActions')}>
          <span className="bulkbar-count">
            {t('tasks:selectedCount', { count: selectedCount })}
          </span>
          <label className="bulk-field">
            <span className="sr-only">{t('tasks:bulkStatus')}</span>
            <select
              className="compact-select"
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as (typeof STATUSES)[number])}
              aria-label={t('tasks:bulkStatus')}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn small"
            disabled={busy}
            onClick={() => applyBulk({ status: bulkStatus })}
          >
            {t('tasks:setStatus')}
          </button>
          <label className="bulk-field">
            <span className="sr-only">{t('tasks:bulkPriority')}</span>
            <select
              className="compact-select"
              value={bulkPriority}
              onChange={(e) => setBulkPriority(Number(e.target.value))}
              aria-label={t('tasks:bulkPriority')}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn small"
            disabled={busy}
            onClick={() => applyBulk({ priority: bulkPriority })}
          >
            {t('tasks:setPriority')}
          </button>
          <button
            type="button"
            className="btn small"
            disabled={busy}
            onClick={() => applyBulkUnread(false)}
          >
            <Icon name="mailOpen" size={14} />
            {t('tasks:markRead')}
          </button>
          <button
            type="button"
            className="btn small"
            disabled={busy}
            onClick={() => applyBulkUnread(true)}
          >
            <Icon name="mail" size={14} />
            {t('tasks:markUnread')}
          </button>
          <button type="button" className="btn ghost small" onClick={clearSelection}>
            {t('common:clear')}
          </button>
        </div>
      )}
    </main>
  )
}
