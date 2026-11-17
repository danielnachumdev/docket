import type { ChartSegment } from './chartTypes'
import './charts.css'

/** Labeled horizontal bars for attention / category counts. */
export function HBars({
  segments,
  emptyLabel,
}: {
  segments: ChartSegment[]
  emptyLabel: string
}) {
  const max = Math.max(1, ...segments.map((s) => s.value))
  const allZero = segments.every((s) => s.value <= 0)

  if (allZero) {
    return <p className="progress-graph-empty">{emptyLabel}</p>
  }

  return (
    <ul className="hbars" role="list">
      {segments.map((s) => {
        const width = `${Math.max(s.value > 0 ? 4 : 0, (s.value / max) * 100)}%`
        return (
          <li key={s.key} className="hbars-row">
            <span className="hbars-label">{s.label}</span>
            <div className="hbars-track" aria-hidden>
              <div className="hbars-fill" style={{ width, background: s.color }} />
            </div>
            <span className="hbars-value">{s.value}</span>
          </li>
        )
      })}
    </ul>
  )
}
