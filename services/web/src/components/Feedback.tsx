import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from './Icon'
import './Feedback.css'

export type Tone = 'danger' | 'warning' | 'info' | 'success'

const TONE_ICON: Record<Tone, IconName> = {
  danger: 'alert',
  warning: 'alert',
  info: 'info',
  success: 'check',
}

export function Alert({
  children,
  tone = 'danger',
  icon,
  action,
  onDismiss,
}: {
  children: ReactNode
  tone?: Tone
  icon?: IconName
  action?: ReactNode
  onDismiss?: () => void
}) {
  const { t } = useTranslation('common')
  return (
    <div className={`alert tone-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={icon ?? TONE_ICON[tone]} />
      <span>{children}</span>
      {action}
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
  action,
  children,
}: {
  icon: IconName
  title: string
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}

export function Spinner() {
  const { t } = useTranslation('common')
  return <span className="spinner" aria-label={t('loading')} />
}
