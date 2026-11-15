import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type UserStats } from '../api'
import { Alert, Skeleton } from '../components/Feedback'
import { PageHeader } from '../components/PageHeader'
import { SectionHeading } from '../components/SectionHeading'
import { formatDateTime } from '../lib/format'

type WindowDays = 7 | 30

function formatDelta(n: number): string {
  if (n > 0) return `+${n}`
  return String(n)
}

function formatRate(rate: number | null, empty: string): string {
  if (rate == null) return empty
  return `${Math.round(rate * 100)}%`
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function ProgressPage() {
  const { t } = useTranslation('progress')
  const [windowDays, setWindowDays] = useState<WindowDays>(7)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (days: WindowDays) => {
    setStats(await api.getMyStats(days))
  }, [])

  useEffect(() => {
    setError(null)
    load(windowDays).catch((err: Error) =>
      setError(err.message || t('loadFailed')),
    )
  }, [load, windowDays, t])

  const windowToggle = (
    <div className="segmented" role="radiogroup" aria-label={t('windowLabel')}>
      {([7, 30] as const).map((days) => (
        <button
          key={days}
          type="button"
          role="radio"
          aria-checked={windowDays === days}
          className={windowDays === days ? 'active' : undefined}
          onClick={() => setWindowDays(days)}
        >
          {days === 7 ? t('window7') : t('window30')}
        </button>
      ))}
    </div>
  )

  return (
    <main className="page narrow">
      <PageHeader
        title={t('title')}
        subtitle={
          stats
            ? t('generatedAt', { when: formatDateTime(stats.generated_at) })
            : t('subtitle')
        }
        actions={windowToggle}
      />

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {stats == null ? (
        <Skeleton rows={6} />
      ) : (
        <>
          <SectionHeading title={t('throughputTitle')} />
          <div className="stat-grid">
            <Stat label={t('completed')} value={stats.throughput.completed} />
            <Stat label={t('priorCompleted')} value={stats.throughput.prior_completed} />
            <Stat label={t('delta')} value={formatDelta(stats.throughput.delta)} />
          </div>

          <SectionHeading title={t('completionTitle')} />
          <div className="stat-grid">
            <Stat label={t('done')} value={stats.completion_rate.done} />
            <Stat label={t('failedTerminal')} value={stats.completion_rate.failed} />
            <Stat label={t('cancelled')} value={stats.completion_rate.cancelled} />
            <Stat
              label={t('rate')}
              value={formatRate(stats.completion_rate.rate, t('rateEmpty'))}
            />
          </div>

          <SectionHeading title={t('cycleTitle')} />
          <div className="stat-grid">
            <Stat
              label={t('medianHours')}
              value={
                stats.cycle_time.median_hours == null
                  ? t('rateEmpty')
                  : stats.cycle_time.median_hours
              }
            />
            <Stat label={t('sampleSize')} value={stats.cycle_time.sample_size} />
          </div>

          <SectionHeading title={t('wipTitle')} />
          <div className="stat-grid">
            <Stat label={t('open')} value={stats.wip.open} />
            <Stat label={t('older7')} value={stats.wip.open_older_than_7d} />
            <Stat label={t('older30')} value={stats.wip.open_older_than_30d} />
          </div>

          <SectionHeading title={t('healthTitle')} />
          <div className="stat-grid">
            <Stat label={t('blocked')} value={stats.blocked.count} />
            <Stat label={t('failedNow')} value={stats.failed.count} />
            <Stat label={t('failedInWindow')} value={stats.failed.in_window} />
          </div>

          <SectionHeading title={t('priorityTitle')} />
          <div className="stat-grid">
            <Stat label={t('p1p2Open')} value={stats.priority.p1_p2_open} />
            <Stat label={t('p1p2Done')} value={stats.priority.p1_p2_done_in_window} />
          </div>

          <SectionHeading title={t('streakTitle')} />
          <div className="stat-grid">
            <Stat
              label={t('currentStreak')}
              value={t('days', { count: stats.streak.current_days })}
            />
            <Stat
              label={t('activeDays')}
              value={t('days', { count: stats.streak.active_days_in_window })}
            />
          </div>

          <SectionHeading title={t('actorTitle')} />
          <div className="stat-grid">
            <Stat label={t('agentCompletions')} value={stats.actor_mix.agent_completions} />
            <Stat label={t('humanCompletions')} value={stats.actor_mix.human_completions} />
          </div>

          <SectionHeading title={t('claimsTitle')} />
          <div className="stat-grid">
            <Stat label={t('claimsActive')} value={stats.claims.active} />
            <Stat label={t('claimsExpired')} value={stats.claims.expired} />
          </div>

          <SectionHeading title={t('outcomesTitle')} />
          <div className="stat-grid">
            <Stat label={t('withOutcome')} value={stats.outcomes.with_outcome} />
            <Stat label={t('withoutOutcome')} value={stats.outcomes.without_outcome} />
          </div>

          <SectionHeading title={t('sharedTitle')} />
          <div className="stat-grid">
            <Stat label={t('ownedCompletions')} value={stats.shared.owned_completions} />
            <Stat
              label={t('sharedCompletions')}
              value={stats.shared.shared_with_me_completions}
            />
          </div>
        </>
      )}
    </main>
  )
}
