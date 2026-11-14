import { useTranslation } from 'react-i18next'
import { dueState, formatDateTime, formatRelative, priorityLabel, statusLabel } from '../lib/format'
import { Icon } from './Icon'

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: number }) {
  const { t } = useTranslation('tasks')
  return (
    <span className={`priority-badge p${priority}`} title={t('priorityN', { priority })}>
      <span className="priority-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {priorityLabel(priority)}
    </span>
  )
}

export function DueBadge({ due, closed }: { due: string | null; closed?: boolean }) {
  const state = dueState(due)
  if (!state) return null
  return (
    <span
      className={`due-badge ${closed ? '' : `due-${state}`}`}
      title={formatDateTime(due)}
    >
      <Icon name="calendar" size={13} />
      {formatRelative(due)}
    </span>
  )
}
