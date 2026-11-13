import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type Props = {
  icon: IconName
  title: string
  count?: number
  action?: ReactNode
  children: ReactNode
}

export function Section({ icon, title, count, action, children }: Props) {
  return (
    <section className="card">
      <header className="card-header">
        <h2>
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
