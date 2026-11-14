import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { Task } from '../api'
import { DueBadge, PriorityBadge } from '../components/Badges'
import { STATUSES, isClosed, statusLabel, type Status } from '../lib/format'

type Props = {
  tasks: Task[]
  onStatusChange: (task: Task, status: Status) => void
}

function columnOf(id: string, tasks: Task[]): Status | null {
  if ((STATUSES as readonly string[]).includes(id)) return id as Status
  const task = tasks.find((t) => t.id === id)
  return task != null ? (task.status as Status) : null
}

function KanbanCardFace({
  task,
  className,
  style,
}: {
  task: Task
  className?: string
  style?: CSSProperties
}) {
  const closed = isClosed(task.status)
  return (
    <article className={className ?? (closed ? 'kanban-card closed' : 'kanban-card')} style={style}>
      <Link to={`/tasks/${task.id}`} className="kanban-card-link" onPointerDown={(e) => e.stopPropagation()}>
        <span className="kanban-card-title">{task.title}</span>
        <span className="kanban-card-meta">
          <PriorityBadge priority={task.priority} />
          <DueBadge due={task.due_at} closed={closed} />
          <span className="meta-item mono">#{task.number}</span>
        </span>
      </Link>
    </article>
  )
}

function SortableKanbanCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'card', status: task.status },
  })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}>
      <KanbanCardFace
        task={task}
        className={
          isDragging
            ? 'kanban-card dragging'
            : isClosed(task.status)
              ? 'kanban-card closed'
              : 'kanban-card'
        }
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
      />
    </div>
  )
}

function KanbanColumn({ status, tasks }: { status: Status; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { type: 'column', status },
  })
  const ids = tasks.map((t) => t.id)
  return (
    <section
      className={isOver ? `kanban-column status-${status} over` : `kanban-column status-${status}`}
      aria-label={`${statusLabel(status)} column`}
    >
      <header className="kanban-column-header">
        <span className={`status-badge status-${status}`}>
          <span className="status-dot" aria-hidden="true" />
          {statusLabel(status)}
        </span>
        <span className="kanban-column-count">{tasks.length}</span>
      </header>
      <div ref={setNodeRef} className="kanban-column-body">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableKanbanCard key={task.id} task={task} />
          ))}
        </SortableContext>
        {tasks.length === 0 && <p className="kanban-empty muted">Drop tasks here</p>}
      </div>
    </section>
  )
}

export function TaskKanbanBoard({ tasks, onStatusChange }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overStatus, setOverStatus] = useState<Status | null>(null)

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(STATUSES.map((s) => [s, [] as Task[]])) as Record<
      Status,
      Task[]
    >
    const sorted = [...tasks].sort((a, b) => a.rank - b.rank || a.number - b.number)
    for (const task of sorted) {
      const status = (STATUSES as readonly string[]).includes(task.status)
        ? (task.status as Status)
        : 'backlog'
      map[status].push(task)
    }
    return map
  }, [tasks])

  const activeTask = activeId != null ? (tasks.find((t) => t.id === activeId) ?? null) : null

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function onDragOver(event: DragOverEvent) {
    const overId = event.over?.id != null ? String(event.over.id) : null
    if (overId == null) {
      setOverStatus(null)
      return
    }
    setOverStatus(columnOf(overId, tasks))
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    setOverStatus(null)
    if (over == null) return
    const task = tasks.find((t) => t.id === String(active.id))
    if (task == null) return
    const nextStatus = columnOf(String(over.id), tasks) ?? overStatus
    if (nextStatus == null || nextStatus === task.status) return
    onStatusChange(task, nextStatus)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="kanban-board" role="region" aria-label="Kanban board">
        {STATUSES.map((status) => (
          <KanbanColumn key={status} status={status} tasks={byStatus[status]} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask != null ? (
          <KanbanCardFace task={activeTask} className="kanban-card dragging overlay" />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
