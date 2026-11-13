import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type Task } from '../api'
import { DueBadge, PriorityBadge, StatusBadge } from '../components/Badges'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { PRIORITIES, STATUSES, isClosed, priorityLabel, statusLabel } from '../lib/format'
import { useAction } from '../lib/useAction'

type TaskNode = Task & { children: TaskNode[] }
type Filter = 'active' | 'all' | (typeof STATUSES)[number]

function nestTasks(tasks: Task[]): TaskNode[] {
  const byId = new Map<number, TaskNode>()
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
    nodes.sort((a, b) => a.rank - b.rank || a.id - b.id)
    for (const n of nodes) sortNodes(n.children)
  }
  sortNodes(roots)
  return roots
}

function matchesFilter(task: Task, filter: Filter, query: string, pinned: Set<number>) {
  if (query && !task.title.toLowerCase().includes(query)) return false
  if (filter === 'all' || pinned.has(task.id)) return true
  if (filter === 'active') return !isClosed(task.status)
  return task.status === filter
}

function filterTree(nodes: TaskNode[], filter: Filter, query: string, pinned: Set<number>): TaskNode[] {
  const out: TaskNode[] = []
  for (const node of nodes) {
    const children = filterTree(node.children, filter, query, pinned)
    if (children.length > 0 || matchesFilter(node, filter, query, pinned)) {
      out.push({ ...node, children })
    }
  }
  return out
}

type RowProps = {
  task: TaskNode
  totalChildren: Map<number, Task[]>
  collapsed: Set<number>
  onToggleCollapse: (id: number) => void
  onToggleDone: (task: Task) => void
}

function TaskRow({ task, totalChildren, collapsed, onToggleCollapse, onToggleDone }: RowProps) {
  const closed = isClosed(task.status)
  const done = task.status === 'done'
  const kids = totalChildren.get(task.id) ?? []
  const kidsDone = kids.filter((k) => k.status === 'done').length
  const isCollapsed = collapsed.has(task.id)

  return (
    <li className="task-node">
      <div className={closed ? 'task-row closed' : 'task-row'}>
        {task.children.length > 0 ? (
          <button
            type="button"
            className="icon-btn ghost expand"
            aria-label={isCollapsed ? 'Expand subtasks' : 'Collapse subtasks'}
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
          aria-label={done ? `Reopen “${task.title}”` : `Mark “${task.title}” done`}
          title={done ? 'Reopen' : 'Mark done'}
          onClick={() => onToggleDone(task)}
        >
          <Icon name="check" size={12} />
        </button>
        <Link to={`/tasks/${task.id}`} className="task-main">
          <span className="task-title">{task.title}</span>
          <span className="task-meta">
            <PriorityBadge priority={task.priority} />
            <DueBadge due={task.due_at} closed={closed} />
            {kids.length > 0 && (
              <span className="meta-item" title="Subtasks done">
                <Icon name="subtasks" size={13} />
                {kidsDone}/{kids.length}
              </span>
            )}
            <span className="meta-item mono">#{task.id}</span>
          </span>
        </Link>
        <span className="task-status">
          <StatusBadge status={task.status} />
        </span>
      </div>
      {task.children.length > 0 && !isCollapsed && (
        <ul className="task-children">
          {task.children.map((child) => (
            <TaskRow
              key={child.id}
              task={child}
              totalChildren={totalChildren}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
              onToggleDone={onToggleDone}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function TaskListPage() {
  const [searchParams] = useSearchParams()
  const archived = searchParams.get('view') === 'archived'
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [filter, setFilter] = useState<Filter>('active')
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set())
  // Tasks toggled in this view stay visible so a mis-click can be undone.
  const [pinned, setPinned] = useState<Set<number>>(() => new Set())
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState(3)
  const { busy, error, setError, run } = useAction()

  const load = useCallback(async () => {
    const rows = await api.listTasks({ archived })
    setTasks(rows)
  }, [archived])

  useEffect(() => {
    setTasks(null)
    setFilter(archived ? 'all' : 'active')
    setPinned(new Set())
    load().catch((err: Error) => setError(err.message))
  }, [archived, load, setError])

  const tree = useMemo(() => nestTasks(tasks ?? []), [tasks])
  const visible = useMemo(
    () => filterTree(tree, filter, query.trim().toLowerCase(), pinned),
    [tree, filter, query, pinned],
  )
  const childrenById = useMemo(() => {
    const map = new Map<number, Task[]>()
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
    return c
  }, [tasks])

  function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    void run(async () => {
      await api.createTask({ title: title.trim(), priority })
      setTitle('')
      await load()
    }, 'Could not create task')
  }

  function toggleDone(task: Task) {
    const next = task.status === 'done' ? 'open' : 'done'
    setPinned((prev) => new Set(prev).add(task.id))
    setTasks((prev) => prev?.map((t) => (t.id === task.id ? { ...t, status: next } : t)) ?? null)
    api.setStatus(task.id, next).catch((err: Error) => {
      setError(err.message)
      void load()
    })
  }

  function toggleCollapse(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filters: Filter[] = ['active', 'all', ...STATUSES]

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>{archived ? 'Archived' : 'Tasks'}</h1>
          <p className="muted">
            {tasks == null
              ? 'Loading…'
              : archived
                ? `${counts.all} archived task${counts.all === 1 ? '' : 's'}`
                : `${counts.active} active · ${counts.done ?? 0} done`}
          </p>
        </div>
      </header>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {!archived && (
        <form className="composer" onSubmit={onCreate}>
          <Icon name="plus" size={18} className="composer-icon" />
          <input
            type="text"
            placeholder="Add a task…"
            aria-label="New task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <select
            className="compact-select"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            aria-label="Priority"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {priorityLabel(p)}
              </option>
            ))}
          </select>
          <button type="submit" className="btn primary" disabled={busy || !title.trim()}>
            Add
          </button>
        </form>
      )}

      <div className="toolbar">
        <label className="search">
          <Icon name="search" />
          <input
            type="search"
            placeholder="Search tasks"
            aria-label="Search tasks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="chips" role="tablist" aria-label="Filter by status">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              className={filter === f ? 'chip active' : 'chip'}
              onClick={() => {
                setFilter(f)
                setPinned(new Set())
              }}
            >
              {f === 'active' ? 'Active' : f === 'all' ? 'All' : statusLabel(f)}
              <span className="chip-count">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {tasks == null ? (
        <Skeleton rows={5} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={archived ? 'archive' : 'inbox'}
          title={
            tasks.length === 0
              ? archived
                ? 'Nothing archived'
                : 'No tasks yet'
              : 'No matching tasks'
          }
        >
          {tasks.length === 0
            ? archived
              ? 'Archived tasks will show up here.'
              : 'Add your first task above, or let an agent create one via the API.'
            : 'Try a different filter or search term.'}
        </EmptyState>
      ) : (
        <ul className="task-tree">
          {visible.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              totalChildren={childrenById}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              onToggleDone={toggleDone}
            />
          ))}
        </ul>
      )}
    </main>
  )
}
