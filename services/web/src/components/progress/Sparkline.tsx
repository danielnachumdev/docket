import { useId, useMemo } from 'react'
import type { DayCount } from '../../api'
import './charts.css'

/** Lightweight SVG area/line sparkline for daily completions. */
export function Sparkline({
  points,
  emptyLabel,
  accent = 'var(--accent)',
}: {
  points: DayCount[]
  emptyLabel: string
  accent?: string
}) {
  const gradId = useId().replace(/:/g, '')
  const total = points.reduce((sum, p) => sum + p.count, 0)

  const geometry = useMemo(() => {
    const w = 320
    const h = 96
    const padX = 4
    const padY = 8
    if (points.length === 0) return null
    const max = Math.max(1, ...points.map((p) => p.count))
    const step = points.length <= 1 ? 0 : (w - padX * 2) / (points.length - 1)
    const coords = points.map((p, i) => {
      const x = padX + i * step
      const y = h - padY - (p.count / max) * (h - padY * 2)
      return { x, y, ...p }
    })
    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')
    const area = `${line} L${coords[coords.length - 1].x.toFixed(1)} ${h - padY} L${coords[0].x.toFixed(1)} ${h - padY} Z`
    return { w, h, coords, line, area, max }
  }, [points])

  if (!geometry || total <= 0) {
    return <p className="progress-graph-empty">{emptyLabel}</p>
  }

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${geometry.w} ${geometry.h}`}
      role="img"
      aria-label={points.map((p) => `${p.day}: ${p.count}`).join(', ')}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={geometry.area} fill={`url(#${gradId})`} />
      <path
        d={geometry.line}
        fill="none"
        stroke={accent}
        strokeWidth="2.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {geometry.coords.map((c) =>
        c.count > 0 ? (
          <circle
            key={c.day}
            cx={c.x}
            cy={c.y}
            r="2.5"
            fill={accent}
            vectorEffect="non-scaling-stroke"
          >
            <title>{`${c.day}: ${c.count}`}</title>
          </circle>
        ) : null,
      )}
    </svg>
  )
}
