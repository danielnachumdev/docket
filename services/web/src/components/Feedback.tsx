import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from './Icon'

export function Alert({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  const { t } = useTranslation('common')
  return (
    <div className="alert" role="alert">
      <Icon name="alert" />
      <span>{children}</span>
      {onDismiss && (
        <button type="button" className="icon-btn" aria-label={t('dismiss')} onClick={onDismiss}>
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: IconName
  title: string
  children?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  )
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  const { t } = useTranslation('common')
  return (
    <div className="skeleton-list" aria-busy="true" aria-label={t('loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  )
}

export function Spinner() {
  const { t } = useTranslation('common')
  return <span className="spinner" aria-label={t('loading')} />
}
