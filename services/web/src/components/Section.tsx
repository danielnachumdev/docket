import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from './Icon'
import './Section.css'

type Props = {
  icon: IconName
  title: string
  headingId?: string
  count?: number
  action?: ReactNode
  className?: string
  variant?: 'card' | 'plain'
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
  variant = 'card',
  collapsible = false,
  defaultCollapsed = false,
  collapseLabel,
  expandLabel,
  collapsedSummary,
  children,
}: Props) {
  const { t } = useTranslation('common')
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const bodyId = useId()
  const expanded = !collapsible || !collapsed

  const root =
    variant === 'plain'
      ? ['section-plain', className].filter(Boolean).join(' ')
      : className
        ? `card ${className}`
        : 'card'

  return (
    <section className={root}>
      <header className="card-header">
        <h2
          id={headingId}
          className={collapsible ? 'section-toggle-title' : undefined}
          onClick={collapsible ? () => setCollapsed((v) => !v) : undefined}
        >
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
              aria-label={
                expanded
                  ? (collapseLabel ?? t('collapseSection', { title }))
                  : (expandLabel ?? t('expandSection', { title }))
              }
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
