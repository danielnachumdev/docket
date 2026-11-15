import type { ReactNode } from 'react'
import './SectionHeading.css'

export function SectionHeading({
  title,
  count,
  action,
}: {
  title: string
  count?: number
  action?: ReactNode
}) {
  return (
    <div className="section-head">
      <h2>
        {title}
        {count != null && count > 0 && <span className="count">{count}</span>}
      </h2>
      {action}
    </div>
  )
}
