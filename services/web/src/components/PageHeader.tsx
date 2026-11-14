import type { ReactNode } from 'react'
import { usePageTitle } from '../lib/usePageTitle'

type Props = {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, actions }: Props) {
  usePageTitle(title)
  return (
    <header className="page-header">
      <div className="min-0">
        <h1>{title}</h1>
        {subtitle != null && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}
