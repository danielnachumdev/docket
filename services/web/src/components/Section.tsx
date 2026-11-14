import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type Props = {
  icon: IconName
  title: string
  headingId?: string
  count?: number
  action?: ReactNode
  className?: string
  children: ReactNode
}

export function Section({ icon, title, headingId, count, action, className, children }: Props) {
  return (
    <section className={className ? `card ${className}` : 'card'}>
      <header className="card-header">
        <h2 id={headingId}>
          <Icon name={icon} />
          {title}
          {count != null && count > 0 && <span className="count">{count}</span>}
        </h2>
        {action}
      </header>
      {children}
    </section>
  )
}
