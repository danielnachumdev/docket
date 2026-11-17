import { chartTotal, type ChartSegment } from './chartTypes'
import './charts.css'

/** Proportional horizontal stack with legend — mix / age breakdowns. */
export function SegmentedBar({
  segments,
  emptyLabel,
}: {
  segments: ChartSegment[]
  emptyLabel: string
}) {
  const total = chartTotal(segments)
  if (total <= 0) {
    return <p className="progress-graph-empty">{emptyLabel}</p>
  }

  return (
    <div className="seg-bar">
      <div
        className="seg-bar-track"
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(', ')}
      >
        {segments.map((s) => {
          if (s.value <= 0) return null
          const width = `${(s.value / total) * 100}%`
          return (
            <div
              key={s.key}
              className="seg-bar-slice"
              style={{ width, background: s.color }}
              title={`${s.label}: ${s.value}`}
            />
          )
        })}
      </div>
      <ul className="seg-bar-legend">
        {segments.map((s) => (
          <li key={s.key}>
            <span className="seg-bar-swatch" style={{ background: s.color }} aria-hidden />
            <span className="seg-bar-name">{s.label}</span>
            <span className="seg-bar-count">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
