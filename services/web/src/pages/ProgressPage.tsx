import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type UserStats } from '../api'
import { Alert, Skeleton } from '../components/Feedback'
import { PageHeader } from '../components/PageHeader'
import { SectionHeading } from '../components/SectionHeading'
import { StatCard, StatGrid } from '../components/StatCard'
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
          <StatGrid>
            <StatCard label={t('completed')} value={stats.throughput.completed} />
            <StatCard label={t('priorCompleted')} value={stats.throughput.prior_completed} />
            <StatCard label={t('delta')} value={formatDelta(stats.throughput.delta)} />
          </StatGrid>

          <SectionHeading title={t('completionTitle')} />
          <StatGrid>
            <StatCard label={t('done')} value={stats.completion_rate.done} />
            <StatCard label={t('failedTerminal')} value={stats.completion_rate.failed} />
            <StatCard label={t('cancelled')} value={stats.completion_rate.cancelled} />
            <StatCard
              label={t('rate')}
              value={formatRate(stats.completion_rate.rate, t('rateEmpty'))}
            />
          </StatGrid>

          <SectionHeading title={t('cycleTitle')} />
          <StatGrid>
            <StatCard
              label={t('medianHours')}
              value={
                stats.cycle_time.median_hours == null
                  ? t('rateEmpty')
                  : stats.cycle_time.median_hours
              }
            />
            <StatCard label={t('sampleSize')} value={stats.cycle_time.sample_size} />
          </StatGrid>

          <SectionHeading title={t('wipTitle')} />
          <StatGrid>
            <StatCard label={t('open')} value={stats.wip.open} />
            <StatCard label={t('older7')} value={stats.wip.open_older_than_7d} />
            <StatCard label={t('older30')} value={stats.wip.open_older_than_30d} />
          </StatGrid>

          <SectionHeading title={t('healthTitle')} />
          <StatGrid>
            <StatCard label={t('blocked')} value={stats.blocked.count} />
            <StatCard label={t('failedNow')} value={stats.failed.count} />
            <StatCard label={t('failedInWindow')} value={stats.failed.in_window} />
          </StatGrid>

          <SectionHeading title={t('priorityTitle')} />
          <StatGrid>
            <StatCard label={t('p1p2Open')} value={stats.priority.p1_p2_open} />
            <StatCard label={t('p1p2Done')} value={stats.priority.p1_p2_done_in_window} />
          </StatGrid>

          <SectionHeading title={t('streakTitle')} />
          <StatGrid>
            <StatCard
              label={t('currentStreak')}
              value={t('days', { count: stats.streak.current_days })}
            />
            <StatCard
              label={t('activeDays')}
              value={t('days', { count: stats.streak.active_days_in_window })}
            />
          </StatGrid>

          <SectionHeading title={t('actorTitle')} />
          <StatGrid>
            <StatCard label={t('agentCompletions')} value={stats.actor_mix.agent_completions} />
            <StatCard label={t('humanCompletions')} value={stats.actor_mix.human_completions} />
          </StatGrid>

          <SectionHeading title={t('claimsTitle')} />
          <StatGrid>
            <StatCard label={t('claimsActive')} value={stats.claims.active} />
            <StatCard label={t('claimsExpired')} value={stats.claims.expired} />
          </StatGrid>

          <SectionHeading title={t('outcomesTitle')} />
          <StatGrid>
            <StatCard label={t('withOutcome')} value={stats.outcomes.with_outcome} />
            <StatCard label={t('withoutOutcome')} value={stats.outcomes.without_outcome} />
          </StatGrid>

          <SectionHeading title={t('sharedTitle')} />
          <StatGrid>
            <StatCard label={t('ownedCompletions')} value={stats.shared.owned_completions} />
            <StatCard
              label={t('sharedCompletions')}
              value={stats.shared.shared_with_me_completions}
            />
          </StatGrid>
        </>
      )}
    </main>
  )
}
