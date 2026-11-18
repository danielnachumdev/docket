import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type Props = {
  icon?: IconName
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode[]
  trailing?: ReactNode
  muted?: boolean
  className?: string
  children?: ReactNode
  /** Full-width block below the main row (e.g. expandable panels). */
  detail?: ReactNode
}

export function ListRow({
  icon,
  leading,
  title,
  subtitle,
  meta,
  trailing,
  muted = false,
  className,
  children,
  detail,
}: Props) {
  const metaItems = meta?.filter((item) => item != null && item !== false) ?? []
  const rowClass = [
    'list-row',
    muted ? 'revoked' : '',
    detail != null ? 'with-detail' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <li className={rowClass}>
      {leading ??
        (icon && (
          <span className="row-icon">
            <Icon name={icon} />
          </span>
        ))}
      <span className="grow min-0">
        <span className="row-title">{title}</span>
        {subtitle != null && <span className="muted small block truncate">{subtitle}</span>}
        {metaItems.length > 0 && (
          <span className="muted small meta-line">
            {metaItems.map((item, i) => (
              <span key={i}>{item}</span>
            ))}
          </span>
        )}
        {children}
      </span>
      {trailing != null && <span className="row-actions">{trailing}</span>}
      {detail != null && <div className="list-row-detail">{detail}</div>}
    </li>
  )
}
