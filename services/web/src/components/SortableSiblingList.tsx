import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icon'

type ListProps = {
  ids: string[]
  className?: string
  onReorder: (activeId: string, orderedIds: string[]) => void
  children: ReactNode
}

export function SortableSiblingList({ ids, className, onReorder, children }: ListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over == null || active.id === over.id) return
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return
    onReorder(String(active.id), arrayMove(ids, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={className}>{children}</ul>
      </SortableContext>
    </DndContext>
  )
}

type ItemProps = {
  id: string
  disabled?: boolean
  children: (args: {
    dragHandle: ReactNode
    setNodeRef: (node: HTMLElement | null) => void
    style: CSSProperties
    isDragging: boolean
  }) => ReactNode
}

export function SortableSiblingItem({ id, disabled, children }: ItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const dragHandle = (
    <button
      type="button"
      className="icon-btn ghost drag-handle"
      aria-label="Drag to reorder"
      title="Drag to reorder"
      disabled={disabled}
      {...attributes}
      {...listeners}
    >
      <Icon name="grip" size={14} />
    </button>
  )
  return <>{children({ dragHandle, setNodeRef, style, isDragging })}</>
}
