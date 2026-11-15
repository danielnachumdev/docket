import { useId, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type Props = {
  icon: IconName
  title: string
  headingId?: string
  count?: number
  action?: ReactNode
  className?: string
  collapsible?: boolean
  defaultCollapsed?: boolean
  collapseLabel?: string
  expandLabel?: string
  collapsedSummary?: ReactNode
  children: ReactNode
}

export function Section({
  icon,
  title,
  headingId,
  count,
  action,
  className,
  collapsible = false,
  defaultCollapsed = false,
  collapseLabel,
  expandLabel,
  collapsedSummary,
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const bodyId = useId()
  const expanded = !collapsible || !collapsed

  return (
    <section className={className ? `card ${className}` : 'card'}>
      <header className="card-header">
        <h2 id={headingId}>
          <Icon name={icon} />
          {title}
          {count != null && count > 0 && <span className="count">{count}</span>}
        </h2>
        <span className="card-header-actions">
          {action}
          {collapsible && (
            <button
              type="button"
              className="icon-btn ghost expand"
              aria-label={expanded ? (collapseLabel ?? 'Collapse') : (expandLabel ?? 'Expand')}
              aria-expanded={expanded}
              aria-controls={bodyId}
              onClick={() => setCollapsed((v) => !v)}
            >
              <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} />
            </button>
          )}
        </span>
      </header>
      {collapsible && collapsed && collapsedSummary != null && (
        <div className="card-collapsed-summary muted small">{collapsedSummary}</div>
      )}
      {expanded &&
        (collapsible ? (
          <div id={bodyId}>{children}</div>
        ) : (
          children
        ))}
    </section>
  )
}
