import type { ReactNode } from 'react'
import './ProgressGraph.css'

/** Graph card shell inspired by raft TrendsGraph: title + optional headline + chart body. */
export function ProgressGraph({
  title,
  subtitle,
  headline,
  headlineLabel,
  empty,
  children,
}: {
  title: string
  subtitle?: string
  headline?: ReactNode
  headlineLabel?: string
  empty?: boolean
  children: ReactNode
}) {
  return (
    <article className="progress-graph" aria-label={title}>
      <header className="progress-graph-head">
        <div className="progress-graph-titles">
          <h3 className="progress-graph-title">{title}</h3>
          {subtitle ? <p className="progress-graph-sub muted">{subtitle}</p> : null}
        </div>
        {headline != null ? (
          <div className="progress-graph-stat">
            <span className="progress-graph-stat-value">{headline}</span>
            {headlineLabel ? (
              <span className="progress-graph-stat-how">{headlineLabel}</span>
            ) : null}
          </div>
        ) : null}
      </header>
      <div className={`progress-graph-body${empty ? ' is-empty' : ''}`}>{children}</div>
    </article>
  )
}
