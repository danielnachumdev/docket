import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, type Task } from '../../api'
import { DueBadge, PriorityBadge, StatusBadge } from '../../components/Badges'
import { Alert } from '../../components/Feedback'
import { Icon } from '../../components/Icon'
import { Section } from '../../components/Section'
import { SortableSiblingItem, SortableSiblingList } from '../../components/SortableSiblingList'
import { PRIORITIES, isClosed, priorityLabel } from '../../lib/format'
import { ranksForOrder, reorderBodyAfterMove } from '../../lib/taskReorder'
import { useAction } from '../../lib/useAction'

type Props = {
  taskId: string
  subtasks: Task[]
  onChanged: () => Promise<void>
}

export function SubtasksSection({ taskId, subtasks, onChanged }: Props) {
  const { t } = useTranslation(['detail', 'common'])
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState(3)
  const [localSubs, setLocalSubs] = useState<Task[] | null>(null)
  const { busy, error, setError, run } = useAction()
  const rows = localSubs ?? subtasks
  const done = rows.filter((row) => row.status === 'done').length
  const ids = rows.map((row) => row.id)

  useEffect(() => {
    setLocalSubs(null)
  }, [subtasks])

  function onAdd(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    void run(async () => {
      await api.createTask({ title: title.trim(), priority, parent_task_id: taskId })
      setTitle('')
      setLocalSubs(null)
      await onChanged()
    }, t('subtasks.addFailed'))
  }

  function onReorder(activeId: string, orderedIds: string[]) {
    const ranks = ranksForOrder(orderedIds)
    const byId = new Map(rows.map((row) => [row.id, row]))
    setLocalSubs(
      orderedIds
        .map((id) => {
          const row = byId.get(id)
          return row == null ? null : { ...row, rank: ranks.get(id)! }
        })
        .filter((row): row is Task => row != null),
    )
    const body = reorderBodyAfterMove(orderedIds, activeId)
    api
      .reorderTask(activeId, body)
      .then(() => onChanged())
      .then(() => setLocalSubs(null))
      .catch((err: Error) => {
        setError(err.message)
        setLocalSubs(null)
        void onChanged()
      })
  }

  return (
    <Section
      icon="subtasks"
      title={t('subtasks.title')}
      action={
        rows.length > 0 && (
          <span className="progress" title={t('subtasks.progress', { done, total: rows.length })}>
            <span className="progress-track">
              <span style={{ width: `${(done / rows.length) * 100}%` }} />
            </span>
            {done}/{rows.length}
          </span>
        )
      }
    >
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {rows.length > 0 && (
        <SortableSiblingList ids={ids} className="list" onReorder={onReorder}>
          {rows.map((child) => (
            <SortableSiblingItem key={child.id} id={child.id}>
              {({ dragHandle, setNodeRef, style, isDragging }) => (
                <li ref={setNodeRef} style={style} className={isDragging ? 'dragging' : undefined}>
                  <div
                    className={
                      isClosed(child.status) ? 'list-row link closed' : 'list-row link'
                    }
                  >
                    {dragHandle}
                    <Link to={`/tasks/${child.id}`} className="subtask-link grow">
                      <StatusBadge status={child.status} />
                      <span className="grow truncate">{child.title}</span>
                      <DueBadge due={child.due_at} closed={isClosed(child.status)} />
                      <PriorityBadge priority={child.priority} />
                    </Link>
                  </div>
                </li>
              )}
            </SortableSiblingItem>
          ))}
        </SortableSiblingList>
      )}
      <form className="inline-form" onSubmit={onAdd}>
        <input
          type="text"
          placeholder={t('subtasks.addPlaceholder')}
          aria-label={t('subtasks.newTitle')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <select
          className="compact-select"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          aria-label={t('subtasks.priority')}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {priorityLabel(p)}
            </option>
          ))}
        </select>
        <button type="submit" className="btn" disabled={busy || !title.trim()}>
          <Icon name="plus" />
          {t('common:add')}
        </button>
      </form>
    </Section>
  )
}
