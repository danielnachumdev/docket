import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type Task } from '../api'

const STATUSES = ['open', 'in_progress', 'blocked', 'done', 'cancelled'] as const

function priorityLabel(p: number) {
  return `P${p}`
}

function formatDue(due: string | null) {
  if (!due) return null
  const d = new Date(due)
  return Number.isNaN(d.getTime()) ? due : d.toLocaleString()
}

export function TaskListPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [archived, setArchived] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState(3)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    const rows = await api.listTasks(archived)
    setTasks(rows)
  }, [archived])

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message))
  }, [load])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.createTask({ title: title.trim(), priority })
      setTitle('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="shell">
      <div className="row-between">
        <h2>Tasks</h2>
        <label className="toggle">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Archived
        </label>
      </div>

      {error && <p className="err">{error}</p>}

      {!archived && (
        <form className="panel form inline" onSubmit={(e) => void onCreate(e)}>
          <input
            type="text"
            placeholder="New task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            aria-label="Priority"
          >
            {[1, 2, 3, 4].map((p) => (
              <option key={p} value={p}>
                {priorityLabel(p)}
              </option>
            ))}
          </select>
          <button type="submit" className="primary" disabled={busy}>
            Add
          </button>
        </form>
      )}

      <ul className="task-list">
        {tasks.map((task) => (
          <li key={task.id} className={`task-row status-${task.status}`}>
            <Link to={`/tasks/${task.id}`} className="task-link">
              <span className="prio">{priorityLabel(task.priority)}</span>
              <span className="task-title">{task.title}</span>
              <span className="badge">{task.status.replace('_', ' ')}</span>
              {task.due_at && (
                <span className="due muted small">due {formatDue(task.due_at)}</span>
              )}
            </Link>
          </li>
        ))}
        {tasks.length === 0 && (
          <li className="muted empty">No tasks yet.</li>
        )}
      </ul>

      <p className="muted small hint">
        Statuses: {STATUSES.map((s) => s.replace('_', ' ')).join(' · ')}
      </p>
    </main>
  )
}
