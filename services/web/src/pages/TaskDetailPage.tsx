import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type TaskDetail } from '../api'

const STATUSES = ['open', 'in_progress', 'blocked', 'done', 'cancelled'] as const

function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(value: string) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function TaskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const taskId = Number(id)
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState(3)
  const [dueLocal, setDueLocal] = useState('')
  const [artifactTitle, setArtifactTitle] = useState('')
  const [artifactText, setArtifactText] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const data = await api.getTask(taskId)
    setDetail(data)
    setTitle(data.task.title)
    setBody(data.task.body ?? '')
    setPriority(data.task.priority)
    setDueLocal(toLocalInput(data.task.due_at))
  }, [taskId])

  useEffect(() => {
    if (!Number.isFinite(taskId)) {
      setError('Invalid task')
      return
    }
    void load().catch((err: Error) => setError(err.message))
  }, [load, taskId])

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const due = fromLocalInput(dueLocal)
      await api.updateTask(taskId, {
        title: title.trim(),
        body,
        priority,
        ...(due ? { due_at: due } : { clear_due_at: true }),
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(status: string) {
    setBusy(true)
    setError(null)
    try {
      await api.setStatus(taskId, status)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status failed')
    } finally {
      setBusy(false)
    }
  }

  async function archiveToggle() {
    if (!detail) return
    setBusy(true)
    try {
      if (detail.task.archived_at) await api.unarchive(taskId)
      else await api.archive(taskId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive failed')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm('Delete this task permanently?')) return
    setBusy(true)
    try {
      await api.deleteTask(taskId)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setBusy(false)
    }
  }

  async function addArtifact(e: FormEvent) {
    e.preventDefault()
    if (!artifactTitle.trim()) return
    setBusy(true)
    try {
      await api.addArtifact(taskId, {
        kind: 'text',
        title: artifactTitle.trim(),
        content_text: artifactText,
      })
      setArtifactTitle('')
      setArtifactText('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Artifact failed')
    } finally {
      setBusy(false)
    }
  }

  if (!detail && !error) {
    return (
      <main className="shell">
        <p className="muted">Loading task…</p>
      </main>
    )
  }

  if (!detail) {
    return (
      <main className="shell">
        <p className="err">{error}</p>
        <Link to="/">Back</Link>
      </main>
    )
  }

  const task = detail.task

  return (
    <main className="shell">
      <p className="crumb">
        <Link to="/">Tasks</Link> / #{task.id}
      </p>
      {error && <p className="err">{error}</p>}

      <form className="panel form" onSubmit={(e) => void save(e)}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Notes
          <textarea
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Context, acceptance notes…"
          />
        </label>
        <div className="form-row">
          <label>
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((p) => (
                <option key={p} value={p}>
                  P{p}
                </option>
              ))}
            </select>
          </label>
          <label>
            Deadline
            <input
              type="datetime-local"
              value={dueLocal}
              onChange={(e) => setDueLocal(e.target.value)}
            />
          </label>
        </div>
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            Save
          </button>
          <button type="button" className="ghost" disabled={busy} onClick={() => void archiveToggle()}>
            {task.archived_at ? 'Unarchive' : 'Archive'}
          </button>
          <button type="button" className="danger" disabled={busy} onClick={() => void remove()}>
            Delete
          </button>
        </div>
      </form>

      <section className="panel">
        <h3>Status</h3>
        <div className="status-pills">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={task.status === s ? 'pill on' : 'pill'}
              disabled={busy}
              onClick={() => void setStatus(s)}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </section>

      {detail.children.length > 0 && (
        <section className="panel">
          <h3>Subtasks</h3>
          <ul className="plain">
            {detail.children.map((child) => (
              <li key={child.id}>
                <Link to={`/tasks/${child.id}`}>
                  P{child.priority} · {child.title}{' '}
                  <span className="muted">({child.status})</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h3>Artifacts</h3>
        <ul className="plain">
          {detail.artifacts.map((a) => (
            <li key={a.id}>
              <strong>{a.title}</strong>{' '}
              <span className="muted small">{a.kind}</span>
              {a.content_text && <pre className="artifact">{a.content_text}</pre>}
            </li>
          ))}
          {detail.artifacts.length === 0 && <li className="muted">None yet.</li>}
        </ul>
        <form className="form" onSubmit={(e) => void addArtifact(e)}>
          <label>
            Add note / link text
            <input
              value={artifactTitle}
              onChange={(e) => setArtifactTitle(e.target.value)}
              placeholder="Title"
              required
            />
          </label>
          <textarea
            rows={3}
            value={artifactText}
            onChange={(e) => setArtifactText(e.target.value)}
            placeholder="Content"
          />
          <button type="submit" className="primary" disabled={busy}>
            Attach
          </button>
        </form>
      </section>

      <section className="panel">
        <h3>History</h3>
        <ol className="timeline">
          {detail.events.map((ev) => (
            <li key={ev.id}>
              <span className="badge">{ev.type}</span>
              <span className="muted small">
                {new Date(ev.created_at).toLocaleString()}
              </span>
              {ev.payload_json && <code className="payload">{ev.payload_json}</code>}
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
