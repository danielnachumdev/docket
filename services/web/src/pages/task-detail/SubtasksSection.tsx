import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type Task } from '../../api'
import { DueBadge, PriorityBadge, StatusBadge } from '../../components/Badges'
import { Alert } from '../../components/Feedback'
import { Icon } from '../../components/Icon'
import { Section } from '../../components/Section'
import { PRIORITIES, isClosed, priorityLabel } from '../../lib/format'
import { useAction } from '../../lib/useAction'

type Props = {
  taskId: string
  subtasks: Task[]
  onChanged: () => Promise<void>
}

export function SubtasksSection({ taskId, subtasks, onChanged }: Props) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState(3)
  const { busy, error, setError, run } = useAction()
  const done = subtasks.filter((t) => t.status === 'done').length

  function onAdd(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    void run(async () => {
      await api.createTask({ title: title.trim(), priority, parent_task_id: taskId })
      setTitle('')
      await onChanged()
    }, 'Could not add subtask')
  }

  return (
    <Section
      icon="subtasks"
      title="Subtasks"
      action={
        subtasks.length > 0 && (
          <span className="progress" title={`${done} of ${subtasks.length} done`}>
            <span className="progress-track">
              <span style={{ width: `${(done / subtasks.length) * 100}%` }} />
            </span>
            {done}/{subtasks.length}
          </span>
        )
      }
    >
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {subtasks.length > 0 && (
        <ul className="list">
          {subtasks.map((child) => (
            <li key={child.id}>
              <Link
                to={`/tasks/${child.id}`}
                className={isClosed(child.status) ? 'list-row link closed' : 'list-row link'}
              >
                <StatusBadge status={child.status} />
                <span className="grow truncate">{child.title}</span>
                <DueBadge due={child.due_at} closed={isClosed(child.status)} />
                <PriorityBadge priority={child.priority} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <form className="inline-form" onSubmit={onAdd}>
        <input
          type="text"
          placeholder="Add a subtask…"
          aria-label="New subtask title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <select
          className="compact-select"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          aria-label="Subtask priority"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {priorityLabel(p)}
            </option>
          ))}
        </select>
        <button type="submit" className="btn" disabled={busy || !title.trim()}>
          <Icon name="plus" />
          Add
        </button>
      </form>
    </Section>
  )
}
