import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type Task, type TaskDetail, type TaskShare } from '../api'
import { useAuth } from '../auth'

const STATUSES = ['open', 'in_progress', 'blocked', 'done', 'cancelled'] as const
const LINK_KINDS = ['blocks', 'related', 'duplicate_of'] as const

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

function descendantIds(taskId: number, all: Task[]): Set<number> {
  const kids = all.filter((t) => t.parent_task_id === taskId)
  const ids = new Set<number>()
  for (const kid of kids) {
    ids.add(kid.id)
    for (const d of descendantIds(kid.id, all)) ids.add(d)
  }
  return ids
}

export function TaskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { status } = useAuth()
  const taskId = Number(id)
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [parentTask, setParentTask] = useState<{ id: number; title: string } | null>(
    null,
  )
  const [parentChoices, setParentChoices] = useState<Task[]>([])
  const [shares, setShares] = useState<TaskShare[]>([])
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState(3)
  const [dueLocal, setDueLocal] = useState('')
  const [parentSelect, setParentSelect] = useState('')
  const [subTitle, setSubTitle] = useState('')
  const [subPriority, setSubPriority] = useState(3)
  const [artifactTitle, setArtifactTitle] = useState('')
  const [artifactText, setArtifactText] = useState('')
  const [artifactKind, setArtifactKind] = useState<'text' | 'link' | 'file'>('text')
  const [artifactFile, setArtifactFile] = useState<File | null>(null)
  const [linkToId, setLinkToId] = useState('')
  const [linkKind, setLinkKind] = useState<(typeof LINK_KINDS)[number]>('related')
  const [shareEmail, setShareEmail] = useState('')
  const [shareRole, setShareRole] = useState<'viewer' | 'editor'>('viewer')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const data = await api.getTask(taskId)
    setDetail(data)
    setTitle(data.task.title)
    setBody(data.task.body ?? '')
    setPriority(data.task.priority)
    setDueLocal(toLocalInput(data.task.due_at))
    setParentSelect(
      data.task.parent_task_id != null ? String(data.task.parent_task_id) : '',
    )

    const all = await api.listTasks({ archived: false })
    const blocked = descendantIds(taskId, all)
    blocked.add(taskId)
    setParentChoices(
      all
        .filter((t) => !blocked.has(t.id))
        .sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id),
    )

    if (data.task.parent_task_id != null) {
      const parentId = data.task.parent_task_id
      const fromList = all.find((t) => t.id === parentId)
      if (fromList) {
        setParentTask({ id: fromList.id, title: fromList.title })
      } else {
        try {
          const parentDetail = await api.getTask(parentId)
          setParentTask({ id: parentDetail.task.id, title: parentDetail.task.title })
        } catch {
          setParentTask({ id: parentId, title: `Task #${parentId}` })
        }
      }
    } else {
      setParentTask(null)
    }

    const shareRows = await api.listShares(taskId)
    setShares(shareRows)
  }, [taskId])

  useEffect(() => {
    if (!Number.isFinite(taskId)) {
      setError('Invalid task')
      return
    }
    void load().catch((err: Error) => setError(err.message))
  }, [load, taskId])

  const parentChanged = useMemo(() => {
    if (!detail) return false
    const current =
      detail.task.parent_task_id != null ? String(detail.task.parent_task_id) : ''
    return parentSelect !== current
  }, [detail, parentSelect])

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const due = fromLocalInput(dueLocal)
      const patch: Record<string, unknown> = {
        title: title.trim(),
        body,
        priority,
        ...(due ? { due_at: due } : { clear_due_at: true }),
      }
      if (parentChanged) {
        if (!parentSelect) patch.clear_parent = true
        else patch.parent_task_id = Number(parentSelect)
      }
      await api.updateTask(taskId, patch)
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
      navigate(detail?.task.parent_task_id ? `/tasks/${detail.task.parent_task_id}` : '/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setBusy(false)
    }
  }

  async function addSubtask(e: FormEvent) {
    e.preventDefault()
    if (!subTitle.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.createTask({
        title: subTitle.trim(),
        priority: subPriority,
        parent_task_id: taskId,
      })
      setSubTitle('')
      setSubPriority(3)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subtask create failed')
    } finally {
      setBusy(false)
    }
  }

  async function fileToBase64(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]!)
    }
    return btoa(binary)
  }

  async function addArtifact(e: FormEvent) {
    e.preventDefault()
    if (!artifactTitle.trim()) return
    setBusy(true)
    setError(null)
    try {
      if (artifactKind === 'file') {
        if (!artifactFile) throw new Error('Choose a file to attach')
        const content_base64 = await fileToBase64(artifactFile)
        await api.addArtifact(taskId, {
          kind: 'file',
          title: artifactTitle.trim(),
          content_base64,
          content_type: artifactFile.type || 'application/octet-stream',
        })
        setArtifactFile(null)
      } else {
        await api.addArtifact(taskId, {
          kind: artifactKind,
          title: artifactTitle.trim(),
          content_text: artifactText,
        })
      }
      setArtifactTitle('')
      setArtifactText('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Artifact failed')
    } finally {
      setBusy(false)
    }
  }

  async function downloadArtifact(artifactId: number, title: string) {
    setBusy(true)
    setError(null)
    try {
      await api.downloadArtifactContent(taskId, artifactId, title)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setBusy(false)
    }
  }

  async function deleteArtifact(artifactId: number) {
    setBusy(true)
    setError(null)
    try {
      await api.deleteArtifact(taskId, artifactId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function addLink(e: FormEvent) {
    e.preventDefault()
    const toTaskId = Number(linkToId)
    if (!Number.isFinite(toTaskId) || toTaskId <= 0) {
      setError('Enter a valid task id to link')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.createLink(taskId, { to_task_id: toTaskId, kind: linkKind })
      setLinkToId('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Link failed')
    } finally {
      setBusy(false)
    }
  }

  async function removeLink(linkId: number) {
    setBusy(true)
    setError(null)
    try {
      await api.deleteLink(taskId, linkId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlink failed')
    } finally {
      setBusy(false)
    }
  }

  async function shareTask(e: FormEvent) {
    e.preventDefault()
    if (!shareEmail.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.shareTask(taskId, {
        email: shareEmail.trim().toLowerCase(),
        role: shareRole,
      })
      setShareEmail('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Share failed')
    } finally {
      setBusy(false)
    }
  }

  async function unshare(membershipId: number) {
    setBusy(true)
    setError(null)
    try {
      await api.unshareTask(taskId, membershipId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unshare failed')
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
  const isOwner = status?.user?.id === task.owner_user_id

  return (
    <main className="shell">
      <p className="crumb">
        <Link to="/">Tasks</Link>
        {parentTask && (
          <>
            {' / '}
            <Link to={`/tasks/${parentTask.id}`}>{parentTask.title}</Link>
          </>
        )}
        {' / '}#{task.id}
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
        <label>
          Parent task
          <select
            value={parentSelect}
            onChange={(e) => setParentSelect(e.target.value)}
            aria-label="Parent task"
          >
            <option value="">None (root)</option>
            {parentChoices.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.id} · {p.title}
              </option>
            ))}
            {parentTask &&
              !parentChoices.some((p) => p.id === parentTask.id) && (
                <option value={parentTask.id}>
                  #{parentTask.id} · {parentTask.title}
                </option>
              )}
          </select>
        </label>
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

      <section className="panel">
        <h3>Subtasks</h3>
        <ul className="plain">
          {detail.children.map((child) => (
            <li key={child.id}>
              <Link to={`/tasks/${child.id}`}>
                P{child.priority} · {child.title}{' '}
                <span className="muted">({child.status.replace('_', ' ')})</span>
              </Link>
            </li>
          ))}
          {detail.children.length === 0 && (
            <li className="muted">No subtasks yet.</li>
          )}
        </ul>
        <form className="form inline" onSubmit={(e) => void addSubtask(e)}>
          <input
            type="text"
            placeholder="New subtask title"
            value={subTitle}
            onChange={(e) => setSubTitle(e.target.value)}
            required
          />
          <select
            value={subPriority}
            onChange={(e) => setSubPriority(Number(e.target.value))}
            aria-label="Subtask priority"
          >
            {[1, 2, 3, 4].map((p) => (
              <option key={p} value={p}>
                P{p}
              </option>
            ))}
          </select>
          <button type="submit" className="primary" disabled={busy}>
            Add subtask
          </button>
        </form>
      </section>

      <section className="panel">
        <h3>Links</h3>
        <ul className="plain">
          {(detail.links ?? []).map((link) => {
            const otherId =
              link.from_task_id === task.id ? link.to_task_id : link.from_task_id
            const direction = link.from_task_id === task.id ? '→' : '←'
            return (
              <li key={link.id} className="link-row">
                <span className="badge">{link.kind}</span>
                <span className="muted">{direction}</span>
                <Link to={`/tasks/${otherId}`}>#{otherId}</Link>
                <button
                  type="button"
                  className="ghost compact"
                  disabled={busy}
                  onClick={() => void removeLink(link.id)}
                >
                  Remove
                </button>
              </li>
            )
          })}
          {(detail.links ?? []).length === 0 && (
            <li className="muted">No links yet.</li>
          )}
        </ul>
        <form className="form form-row" onSubmit={(e) => void addLink(e)}>
          <label>
            Kind
            <select
              value={linkKind}
              onChange={(e) =>
                setLinkKind(e.target.value as (typeof LINK_KINDS)[number])
              }
            >
              {LINK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label>
            To task #
            <input
              type="number"
              min={1}
              value={linkToId}
              onChange={(e) => setLinkToId(e.target.value)}
              placeholder="id"
              required
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            Add link
          </button>
        </form>
      </section>


      <section className="panel">
        <h3>Sharing</h3>
        <ul className="plain">
          {shares.map((s) => (
            <li key={s.id} className="row-between">
              <span>
                {s.display_name}{' '}
                <span className="muted small">
                  ({s.email ?? 'no email'}) · {s.role}
                </span>
              </span>
              {isOwner && (
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() => void unshare(s.id)}
                >
                  Unshare
                </button>
              )}
            </li>
          ))}
          {shares.length === 0 && <li className="muted">Not shared with anyone.</li>}
        </ul>
        {isOwner && (
          <form className="form inline" onSubmit={(e) => void shareTask(e)}>
            <input
              type="email"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
            <select
              value={shareRole}
              onChange={(e) => setShareRole(e.target.value as 'viewer' | 'editor')}
              aria-label="Share role"
            >
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
            </select>
            <button type="submit" className="primary" disabled={busy}>
              Share
            </button>
          </form>
        )}
      </section>

      <section className="panel">
        <h3>Artifacts</h3>
        <ul className="plain">
          {detail.artifacts.map((a) => (
            <li key={a.id}>
              <strong>{a.title}</strong>{' '}
              <span className="muted small">{a.kind}</span>
              {a.content_type && (
                <span className="muted small"> · {a.content_type}</span>
              )}
              {a.content_text && a.kind !== 'file' && (
                <pre className="artifact">{a.content_text}</pre>
              )}
              <div className="form inline">
                {(a.storage_key || a.content_text) && (
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={() => void downloadArtifact(a.id, a.title)}
                  >
                    Download
                  </button>
                )}
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() => void deleteArtifact(a.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {detail.artifacts.length === 0 && <li className="muted">None yet.</li>}
        </ul>
        <form className="form" onSubmit={(e) => void addArtifact(e)}>
          <label>
            Kind
            <select
              value={artifactKind}
              onChange={(e) =>
                setArtifactKind(e.target.value as 'text' | 'link' | 'file')
              }
              aria-label="Artifact kind"
            >
              <option value="text">text</option>
              <option value="link">link</option>
              <option value="file">file</option>
            </select>
          </label>
          <label>
            Title
            <input
              value={artifactTitle}
              onChange={(e) => setArtifactTitle(e.target.value)}
              placeholder="Title"
              required
            />
          </label>
          {artifactKind === 'file' ? (
            <label>
              File
              <input
                type="file"
                onChange={(e) => setArtifactFile(e.target.files?.[0] ?? null)}
                required
              />
            </label>
          ) : (
            <textarea
              rows={3}
              value={artifactText}
              onChange={(e) => setArtifactText(e.target.value)}
              placeholder={artifactKind === 'link' ? 'https://example.com/...' : 'Content'}
            />
          )}
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
