import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import './Skeleton.css'

const TITLE_WIDTHS = [62, 48, 74, 55, 68, 41, 58]
const META_WIDTHS = [28, 36, 22, 32, 25]

type Leading = 'check' | 'icon' | 'avatar' | 'none'

function Bone({ className, width }: { className: string; width?: number }) {
  const style: CSSProperties | undefined = width != null ? { width: `${width}%` } : undefined
  return <span className={`bone ${className}`} style={style} />
}

function Frame({ className, children }: { className: string; children: ReactNode }) {
  const { t } = useTranslation('common')
  return (
    <div className={`skeleton ${className}`} role="status" aria-busy="true" aria-label={t('loading')}>
      {children}
    </div>
  )
}

function Lines({ index }: { index: number }) {
  return (
    <span className="skeleton-lines">
      <Bone className="bone-line" width={TITLE_WIDTHS[index % TITLE_WIDTHS.length]} />
      <Bone className="bone-line sm" width={META_WIDTHS[index % META_WIDTHS.length]} />
    </span>
  )
}

/** Card of rows shaped like task, notification, and settings lists. */
export function Skeleton({
  rows = 4,
  leading = 'icon',
  trailing = false,
}: {
  rows?: number
  leading?: Leading
  trailing?: boolean
}) {
  return (
    <Frame className="skeleton-list">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          {leading !== 'none' && <Bone className={`bone-${leading}`} />}
          <Lines index={i} />
          {trailing && <Bone className="bone-pill" />}
        </div>
      ))}
    </Frame>
  )
}

/** Section headings over stat-card grids (Storage overview). */
export function StatsSkeleton({ groups = 2, perGroup = 3 }: { groups?: number; perGroup?: number }) {
  return (
    <Frame className="skeleton-stats">
      {Array.from({ length: groups }, (_, g) => (
        <div key={g} className="skeleton-stat-group">
          <Bone className="bone-heading" width={g % 2 === 0 ? 22 : 30} />
          <div className="skeleton-stat-grid">
            {Array.from({ length: perGroup }, (_, i) => (
              <div key={i} className="skeleton-stat">
                <Bone className="bone-line sm" width={META_WIDTHS[(g + i) % META_WIDTHS.length] + 30} />
                <Bone className="bone-value" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Frame>
  )
}

/** KPI strip + graph cards for the Progress page. */
export function ProgressSkeleton() {
  return (
    <Frame className="skeleton-progress">
      <div className="skeleton-progress-kpis">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skeleton-progress-kpi">
            <Bone className="bone-line sm" width={META_WIDTHS[i % META_WIDTHS.length] + 20} />
            <Bone className="bone-value" />
            <Bone className="bone-line sm" width={40} />
          </div>
        ))}
      </div>
      <div className="skeleton-progress-graphs">
        <div className="skeleton-progress-graph is-wide">
          <Bone className="bone-heading" width={28} />
          <Bone className="bone-block" width={100} />
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton-progress-graph">
            <Bone className="bone-heading" width={TITLE_WIDTHS[i % TITLE_WIDTHS.length] / 2} />
            <Bone className="bone-block" width={100} />
          </div>
        ))}
      </div>
    </Frame>
  )
}

/** Label + control pairs for forms that wait on a lookup (invite preview). */
export function FormSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <Frame className="skeleton-form">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="skeleton-field">
          <Bone className="bone-line sm" width={META_WIDTHS[i % META_WIDTHS.length]} />
          <Bone className="bone-control" />
        </div>
      ))}
      <Bone className="bone-button" />
    </Frame>
  )
}

/** Task detail: title, meta pills, main cards and the properties rail. */
export function DetailSkeleton() {
  return (
    <Frame className="skeleton-detail">
      <div className="skeleton-detail-header">
        <Bone className="bone-line sm" width={14} />
        <Bone className="bone-title" width={46} />
        <span className="skeleton-pills">
          <Bone className="bone-pill" />
          <Bone className="bone-pill" />
          <Bone className="bone-line sm" width={18} />
        </span>
      </div>
      <div className="skeleton-detail-grid">
        <div className="skeleton-detail-main">
          {[5.5, 7, 9].map((h, i) => (
            <div key={i} className="skeleton-card">
              <Bone className="bone-line" width={18 + i * 4} />
              <span className="bone bone-block" style={{ height: `${h}rem` }} />
            </div>
          ))}
        </div>
        <div className="skeleton-card skeleton-detail-rail">
          <Bone className="bone-line" width={30} />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton-field">
              <Bone className="bone-line sm" width={META_WIDTHS[i]} />
              <Bone className="bone-control" />
            </div>
          ))}
          {[0, 1, 2].map((i) => (
            <Bone key={i} className="bone-line" width={TITLE_WIDTHS[i] - 20} />
          ))}
        </div>
      </div>
    </Frame>
  )
}
