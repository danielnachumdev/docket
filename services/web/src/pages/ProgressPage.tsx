import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type UserStats } from '../api'
import { Alert } from '../components/Feedback'
import { CompareBars } from '../components/progress/CompareBars'
import { wipAgeBuckets } from '../components/progress/chartTypes'
import { HBars } from '../components/progress/HBars'
import { ProgressGraph } from '../components/progress/ProgressGraph'
import { SegmentedBar } from '../components/progress/SegmentedBar'
import { Sparkline } from '../components/progress/Sparkline'
import { ProgressSkeleton } from '../components/Skeleton'
import { PageHeader } from '../components/PageHeader'
import { formatDateTime } from '../lib/format'
import './ProgressPage.css'

type WindowDays = 7 | 30

function formatDelta(n: number): string {
  if (n > 0) return `+${n}`
  return String(n)
}

function formatRate(rate: number | null, empty: string): string {
  if (rate == null) return empty
  return `${Math.round(rate * 100)}%`
}

function formatHours(hours: number | null, empty: string): string {
  if (hours == null) return empty
  return String(hours)
}

function wipAgeSegments(stats: UserStats, labels: { fresh: string; mid: string; old: string }) {
  const buckets = wipAgeBuckets(stats.wip)
  return [
    { key: 'fresh', label: labels.fresh, value: buckets.fresh, color: 'var(--success)' },
    { key: 'mid', label: labels.mid, value: buckets.mid, color: 'var(--warning)' },
    { key: 'old', label: labels.old, value: buckets.old, color: 'var(--danger)' },
  ]
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

  const delta = stats?.throughput.delta ?? 0
  const deltaClass =
    delta > 0 ? 'progress-kpi-meta is-up' : delta < 0 ? 'progress-kpi-meta is-down' : 'progress-kpi-meta'

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
        <ProgressSkeleton />
      ) : (
        <>
          <section className="progress-kpis" aria-label={t('kpiTitle')}>
            <div className="progress-kpi">
              <span className="progress-kpi-label">{t('completed')}</span>
              <strong className="progress-kpi-value">{stats.throughput.completed}</strong>
              <span className={deltaClass}>
                {t('deltaVsPrior', { delta: formatDelta(delta) })}
              </span>
            </div>
            <div className="progress-kpi">
              <span className="progress-kpi-label">{t('rate')}</span>
              <strong className="progress-kpi-value">
                {formatRate(stats.completion_rate.rate, t('rateEmpty'))}
              </strong>
              <span className="progress-kpi-meta">
                {t('terminalMix', {
                  done: stats.completion_rate.done,
                  failed: stats.completion_rate.failed,
                  cancelled: stats.completion_rate.cancelled,
                })}
              </span>
            </div>
            <div className="progress-kpi">
              <span className="progress-kpi-label">{t('open')}</span>
              <strong className="progress-kpi-value">{stats.wip.open}</strong>
              <span className="progress-kpi-meta">
                {t('streakMeta', {
                  streak: t('days', { count: stats.streak.current_days }),
                  active: t('days', { count: stats.streak.active_days_in_window }),
                })}
              </span>
            </div>
          </section>

          <section className="progress-graphs" aria-label={t('graphsTitle')}>
            <ProgressGraph
              title={t('throughputTitle')}
              subtitle={t('throughputSub', {
                prior: stats.throughput.prior_completed,
                delta: formatDelta(stats.throughput.delta),
              })}
              headline={stats.throughput.completed}
              headlineLabel={t('completed')}
              empty={stats.completions_by_day.every((p) => p.count === 0)}
            >
              <Sparkline points={stats.completions_by_day} emptyLabel={t('chartEmpty')} />
            </ProgressGraph>

            <ProgressGraph
              title={t('completionTitle')}
              subtitle={t('completionSub')}
              headline={formatRate(stats.completion_rate.rate, t('rateEmpty'))}
              headlineLabel={t('rate')}
            >
              <SegmentedBar
                segments={[
                  {
                    key: 'done',
                    label: t('done'),
                    value: stats.completion_rate.done,
                    color: 'var(--st-done)',
                  },
                  {
                    key: 'failed',
                    label: t('failedTerminal'),
                    value: stats.completion_rate.failed,
                    color: 'var(--st-failed)',
                  },
                  {
                    key: 'cancelled',
                    label: t('cancelled'),
                    value: stats.completion_rate.cancelled,
                    color: 'var(--st-cancelled)',
                  },
                ]}
                emptyLabel={t('chartEmpty')}
              />
            </ProgressGraph>

            <ProgressGraph
              title={t('wipTitle')}
              subtitle={t('wipSub')}
              headline={stats.wip.open}
              headlineLabel={t('open')}
            >
              <SegmentedBar
                segments={wipAgeSegments(stats, {
                  fresh: t('wipFresh'),
                  mid: t('wipMid'),
                  old: t('wipOld'),
                })}
                emptyLabel={t('chartEmpty')}
              />
            </ProgressGraph>

            <ProgressGraph
              title={t('actorTitle')}
              subtitle={t('actorSub')}
              headline={
                stats.actor_mix.agent_completions + stats.actor_mix.human_completions
              }
              headlineLabel={t('completions')}
            >
              <SegmentedBar
                segments={[
                  {
                    key: 'agent',
                    label: t('agentCompletions'),
                    value: stats.actor_mix.agent_completions,
                    color: 'var(--accent)',
                  },
                  {
                    key: 'human',
                    label: t('humanCompletions'),
                    value: stats.actor_mix.human_completions,
                    color: 'var(--st-in_progress)',
                  },
                ]}
                emptyLabel={t('chartEmpty')}
              />
            </ProgressGraph>

            <ProgressGraph
              title={t('healthTitle')}
              subtitle={t('healthSub')}
              headline={stats.blocked.count + stats.failed.count}
              headlineLabel={t('attentionNow')}
            >
              <HBars
                segments={[
                  {
                    key: 'blocked',
                    label: t('blocked'),
                    value: stats.blocked.count,
                    color: 'var(--st-blocked)',
                  },
                  {
                    key: 'failed',
                    label: t('failedNow'),
                    value: stats.failed.count,
                    color: 'var(--st-failed)',
                  },
                  {
                    key: 'failedWindow',
                    label: t('failedInWindow'),
                    value: stats.failed.in_window,
                    color: 'color-mix(in srgb, var(--st-failed) 55%, var(--muted))',
                  },
                  {
                    key: 'p1open',
                    label: t('p1p2Open'),
                    value: stats.priority.p1_p2_open,
                    color: 'var(--p1)',
                  },
                  {
                    key: 'p1done',
                    label: t('p1p2Done'),
                    value: stats.priority.p1_p2_done_in_window,
                    color: 'var(--success)',
                  },
                  {
                    key: 'claimsActive',
                    label: t('claimsActive'),
                    value: stats.claims.active,
                    color: 'var(--accent)',
                  },
                  {
                    key: 'claimsExpired',
                    label: t('claimsExpired'),
                    value: stats.claims.expired,
                    color: 'var(--warning)',
                  },
                ]}
                emptyLabel={t('chartEmpty')}
              />
            </ProgressGraph>

            <ProgressGraph
              title={t('outcomesTitle')}
              subtitle={t('outcomesSub')}
              headline={stats.outcomes.with_outcome}
              headlineLabel={t('withOutcome')}
            >
              <SegmentedBar
                segments={[
                  {
                    key: 'with',
                    label: t('withOutcome'),
                    value: stats.outcomes.with_outcome,
                    color: 'var(--success)',
                  },
                  {
                    key: 'without',
                    label: t('withoutOutcome'),
                    value: stats.outcomes.without_outcome,
                    color: 'color-mix(in srgb, var(--muted) 70%, transparent)',
                  },
                ]}
                emptyLabel={t('chartEmpty')}
              />
            </ProgressGraph>

            <ProgressGraph
              title={t('sharedTitle')}
              subtitle={t('sharedSub')}
              headline={stats.shared.owned_completions}
              headlineLabel={t('ownedCompletions')}
            >
              <CompareBars
                segments={[
                  {
                    key: 'owned',
                    label: t('ownedCompletions'),
                    value: stats.shared.owned_completions,
                    color: 'var(--accent)',
                  },
                  {
                    key: 'shared',
                    label: t('sharedCompletions'),
                    value: stats.shared.shared_with_me_completions,
                    color: 'var(--st-done)',
                  },
                ]}
                emptyLabel={t('chartEmpty')}
              />
            </ProgressGraph>
          </section>

          <ul className="progress-meta-row">
            <li>
              {t('medianHours')}:{' '}
              <strong>{formatHours(stats.cycle_time.median_hours, t('rateEmpty'))}</strong>
              {stats.cycle_time.sample_size > 0
                ? ` (${t('sampleSize')}: ${stats.cycle_time.sample_size})`
                : null}
            </li>
            <li>
              {t('currentStreak')}:{' '}
              <strong>{t('days', { count: stats.streak.current_days })}</strong>
            </li>
            <li>
              {t('activeDays')}:{' '}
              <strong>{t('days', { count: stats.streak.active_days_in_window })}</strong>
            </li>
          </ul>
        </>
      )}
    </main>
  )
}
