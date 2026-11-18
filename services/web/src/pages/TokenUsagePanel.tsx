import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  api,
  type DayCount,
  type TokenRequestLog,
  type TokenUsage,
  type TokenUsageStatus,
} from '../api'
import { Alert } from '../components/Feedback'
import { ProgressGraph } from '../components/progress/ProgressGraph'
import { SegmentedBar } from '../components/progress/SegmentedBar'
import { Sparkline } from '../components/progress/Sparkline'
import { Skeleton } from '../components/Skeleton'
import { formatDateTime, formatRelative } from '../lib/format'
import './TokenUsagePanel.css'

const WINDOWS = [1, 7, 14, 30] as const

function bucketPoints(usage: TokenUsage): DayCount[] {
  return usage.requests_by_bucket.map((b) => ({
    day: b.bucket.slice(0, usage.granularity === 'hour' ? 16 : 10),
    count: b.count,
  }))
}

function statusSegments(
  mix: TokenUsageStatus[],
  labels: Record<TokenUsageStatus['status_class'], string>,
) {
  const colors: Record<TokenUsageStatus['status_class'], string> = {
    '2xx': 'var(--success)',
    '3xx': 'var(--accent)',
    '4xx': 'var(--warning)',
    '5xx': 'var(--danger)',
    other: 'var(--muted)',
  }
  return mix.map((row) => ({
    key: row.status_class,
    label: labels[row.status_class],
    value: row.count,
    color: colors[row.status_class],
  }))
}

export function TokenUsagePanel({ tokenId }: { tokenId: number }) {
  const { t } = useTranslation('integrations')
  const [windowDays, setWindowDays] = useState<(typeof WINDOWS)[number]>(7)
  const [usage, setUsage] = useState<TokenUsage | null>(null)
  const [requests, setRequests] = useState<TokenRequestLog[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    setUsage(null)
    const [usageRow, page] = await Promise.all([
      api.tokenUsage(tokenId, windowDays),
      api.tokenRequests(tokenId, { offset: 0, limit: 25, windowDays: windowDays }),
    ])
    setUsage(usageRow)
    setRequests(page.items)
    setHasMore(page.has_more)
    setTotal(page.total)
  }, [tokenId, windowDays])

  useEffect(() => {
    load().catch((err: Error) => setError(err.message || t('tokens.usageLoadFailed')))
  }, [load, t])

  async function onLoadMore() {
    setLoadingMore(true)
    try {
      const page = await api.tokenRequests(tokenId, {
        offset: requests.length,
        limit: 25,
        windowDays,
      })
      setRequests((prev) => [...prev, ...page.items])
      setHasMore(page.has_more)
      setTotal(page.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tokens.usageLoadFailed'))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="token-usage-panel">
      <div className="token-usage-toolbar">
        <span className="muted small">{t('tokens.usageWindow')}</span>
        <div className="token-usage-windows" role="group" aria-label={t('tokens.usageWindow')}>
          {WINDOWS.map((days) => (
            <button
              key={days}
              type="button"
              className={`btn ghost small${windowDays === days ? ' is-active' : ''}`}
              aria-pressed={windowDays === days}
              onClick={() => setWindowDays(days)}
            >
              {t('tokens.windowDays', { count: days })}
            </button>
          ))}
        </div>
      </div>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {usage == null ? (
        <Skeleton rows={2} trailing />
      ) : (
        <div className="token-usage-graphs">
          <ProgressGraph
            title={t('tokens.trendTitle')}
            subtitle={
              usage.granularity === 'hour' ? t('tokens.trendHourly') : t('tokens.trendDaily')
            }
            headline={usage.total_requests}
            headlineLabel={t('tokens.requestCount', { count: usage.total_requests })}
            empty={usage.total_requests === 0}
          >
            <Sparkline points={bucketPoints(usage)} emptyLabel={t('tokens.chartEmpty')} />
          </ProgressGraph>
          <ProgressGraph
            title={t('tokens.statusTitle')}
            subtitle={t('tokens.statusSub')}
            empty={usage.status_mix.length === 0}
          >
            <SegmentedBar
              segments={statusSegments(usage.status_mix, {
                '2xx': t('tokens.status2xx'),
                '3xx': t('tokens.status3xx'),
                '4xx': t('tokens.status4xx'),
                '5xx': t('tokens.status5xx'),
                other: t('tokens.statusOther'),
              })}
              emptyLabel={t('tokens.chartEmpty')}
            />
          </ProgressGraph>
        </div>
      )}

      {usage != null && usage.top_paths.length > 0 && (
        <div className="token-usage-paths">
          <h4 className="token-usage-section-title">{t('tokens.topPaths')}</h4>
          <ul className="token-usage-path-list">
            {usage.top_paths.map((row) => (
              <li key={row.path}>
                <code>{row.path}</code>
                <span className="muted tabular">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="token-usage-log">
        <h4 className="token-usage-section-title">
          {t('tokens.requestLog')}
          {total > 0 ? <span className="muted"> · {total}</span> : null}
        </h4>
        {requests.length === 0 ? (
          <p className="muted small">{t('tokens.requestLogEmpty')}</p>
        ) : (
          <ul className="token-usage-request-list">
            {requests.map((row) => (
              <li key={row.id} className="token-usage-request">
                <span className="token-usage-request-main">
                  <span className="token-usage-method">{row.method}</span>
                  <code className="token-usage-path">{row.path}</code>
                  <span className={`token-usage-status status-${Math.floor(row.status_code / 100)}xx`}>
                    {row.status_code}
                  </span>
                </span>
                <span className="muted small meta-line">
                  <span title={formatDateTime(row.created_at)}>
                    {formatRelative(row.created_at)}
                  </span>
                  <span>{row.client_ip ?? t('tokens.ipUnknown')}</span>
                  {row.user_agent ? (
                    <span className="token-usage-ua" title={row.user_agent}>
                      {row.user_agent}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <button
            type="button"
            className="btn ghost small"
            disabled={loadingMore}
            onClick={() => void onLoadMore()}
          >
            {loadingMore ? t('tokens.loadingMore') : t('tokens.loadMore')}
          </button>
        )}
      </div>
    </div>
  )
}
