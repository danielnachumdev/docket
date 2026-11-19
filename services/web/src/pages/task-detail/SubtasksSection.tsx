import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, type Task } from '../../api'
import { DueBadge, PriorityBadge, StatusBadge } from '../../components/Badges'
import { Alert } from '../../components/Feedback'
import { Icon } from '../../components/Icon'
import { Section } from '../../components/Section'
import { SortableSiblingItem, SortableSiblingList } from '../../components/SortableSiblingList'
import { UserBidiText } from '../../components/UserBidiText'
import { userBidiAttrs } from '../../lib/bidi'
import { PRIORITIES, isClosed, priorityLabel } from '../../lib/format'
import { groupTasksByDueSection, type DueSectionId } from '../../lib/localDay'
import { ranksForOrder, reorderBodyAfterMove } from '../../lib/taskReorder'
import { useAction } from '../../lib/useAction'
import { usePreferences } from '../../preferences'
import './SubtasksSection.css'

type Props = {
  taskId: string
  subtasks: Task[]
  onChanged: () => Promise<void>
  compact?: boolean
  variant?: 'card' | 'plain'
  /** Render as a disclosure; collapsed on first render when true. */
  defaultCollapsed?: boolean
  /** Guest / external share: list only, no create/reorder/navigation. */
  readOnly?: boolean
}

function sortByRank(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => a.rank - b.rank || a.number - b.number)
}

export function SubtasksSection({
  taskId,
  subtasks,
  onChanged,
  compact = false,
  variant = 'card',
  defaultCollapsed,
  readOnly = false,
}: Props) {
  const { t } = useTranslation(['detail', 'tasks', 'common', 'externalShare'])
  const { taskSortMode } = usePreferences()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState(3)
  const [localSubs, setLocalSubs] = useState<Task[] | null>(null)
  const { busy, error, setError, run } = useAction()
  const rows = useMemo(() => sortByRank(localSubs ?? subtasks), [localSubs, subtasks])
  const done = rows.filter((row) => row.status === 'done').length
  const ids = rows.map((row) => row.id)
  const dateMode = taskSortMode === 'date'
  const dateSections = useMemo(
    () => (dateMode ? groupTasksByDueSection(rows) : []),
    [dateMode, rows],
  )

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
    if (dateMode) return
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

  function renderRow(child: Task) {
    const body = (
      <>
        <StatusBadge status={child.status} />
        <UserBidiText text={child.title} className="grow truncate" />
        <DueBadge due={child.due_at} closed={isClosed(child.status)} />
        <PriorityBadge priority={child.priority} />
      </>
    )
    if (readOnly) {
      return (
        <li key={child.id}>
          <div
            className={isClosed(child.status) ? 'list-row closed' : 'list-row'}
            title={t('externalShare:noAccess')}
          >
            <span className="subtask-link grow">{body}</span>
          </div>
        </li>
      )
    }
    return (
      <SortableSiblingItem key={child.id} id={child.id} disabled={dateMode}>
        {({ dragHandle, setNodeRef, style, isDragging }) => (
          <li ref={setNodeRef} style={style} className={isDragging ? 'dragging' : undefined}>
            <div className={isClosed(child.status) ? 'list-row link closed' : 'list-row link'}>
              {dateMode ? <span className="drag-handle-spacer" aria-hidden="true" /> : dragHandle}
              <Link to={`/tasks/${child.id}`} className="subtask-link grow">
                {body}
              </Link>
            </div>
          </li>
        )}
      </SortableSiblingItem>
    )
  }

  const listBody =
    rows.length > 0 &&
    (readOnly ? (
      <ul className="list">{rows.map((child) => renderRow(child))}</ul>
    ) : dateMode ? (
      <div className="subtask-date-sections">
        {dateSections.map((section) => (
          <section
            key={section.id}
            className="due-section"
            aria-label={t(`tasks:dueSection.${section.id as DueSectionId}`)}
          >
            <h3 className="due-section-title">
              {t(`tasks:dueSection.${section.id as DueSectionId}`)}
            </h3>
            <SortableSiblingList
              ids={section.tasks.map((row) => row.id)}
              className="list"
              onReorder={onReorder}
            >
              {section.tasks.map((child) => renderRow(child))}
            </SortableSiblingList>
          </section>
        ))}
      </div>
    ) : (
      <SortableSiblingList ids={ids} className="list" onReorder={onReorder}>
        {rows.map((child) => renderRow(child))}
      </SortableSiblingList>
    ))

  return (
    <Section
      icon="subtasks"
      title={t('subtasks.title')}
      variant={variant}
      collapsible={defaultCollapsed != null}
      defaultCollapsed={defaultCollapsed}
      className={compact ? 'subtasks-side' : undefined}
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
      {listBody}
      {!readOnly && (
        <form className="inline-form" onSubmit={onAdd}>
          <input
            type="text"
            placeholder={t('subtasks.addPlaceholder')}
            aria-label={t('subtasks.newTitle')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            {...userBidiAttrs(title)}
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
      )}
    </Section>
  )
}
