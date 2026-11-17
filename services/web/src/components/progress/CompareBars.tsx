import type { ChartSegment } from './chartTypes'
import './charts.css'

/** Compact vertical bar compare (current vs prior, etc.). */
export function CompareBars({
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
    <div className="compare-bars" role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(', ')}>
      {segments.map((s) => {
        const height = `${Math.max(6, (s.value / max) * 100)}%`
        return (
          <div key={s.key} className="compare-bars-col">
            <div className="compare-bars-track">
              <div
                className="compare-bars-fill"
                style={{ height, background: s.color }}
                title={`${s.label}: ${s.value}`}
              />
            </div>
            <span className="compare-bars-value">{s.value}</span>
            <span className="compare-bars-label">{s.label}</span>
          </div>
        )
      })}
    </div>
  )
}
