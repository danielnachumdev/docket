import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, type Artifact } from '../api'
import { useAuth } from '../auth'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import {
  ARTIFACT_KIND_FILTERS,
  ARTIFACT_SORTS,
  groupArtifacts,
  taskGroupLabel,
  type ArtifactKindFilter,
  type ArtifactSort,
} from '../lib/artifactsLibrary'
import { useAction } from '../lib/useAction'
import { useKeyboardShortcut } from '../lib/useKeyboardShortcut'
import { ArtifactRow } from './task-detail/ArtifactRow'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300

const EMPTY_KIND_COUNTS: Record<ArtifactKindFilter, number> = {
  all: 0,
  text: 0,
  link: 0,
  file: 0,
}

export function ArtifactsPage() {
  const { t } = useTranslation('artifacts')
  const { status: auth } = useAuth()
  const userId = auth?.user?.id ?? null
  const [rows, setRows] = useState<Artifact[] | null>(null)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [kindCounts, setKindCounts] = useState(EMPTY_KIND_COUNTS)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [kind, setKind] = useState<ArtifactKindFilter>('all')
  const [sort, setSort] = useState<ArtifactSort>('newest')
  const [mineOnly, setMineOnly] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [loadingMore, setLoadingMore] = useState(false)
  const { busy, error, setError, run } = useAction()
  const searchRef = useRef<HTMLInputElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const requestGen = useRef(0)
  const loadingMoreLock = useRef(false)

  useKeyboardShortcut('/', () => searchRef.current?.focus())

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  const fetchPage = useCallback(
    async (offset: number) =>
      api.listArtifacts({
        kind,
        q: debouncedQuery,
        sort,
        mine: mineOnly,
        offset,
        limit: PAGE_SIZE,
      }),
    [kind, debouncedQuery, sort, mineOnly],
  )

  const applyKindCounts = useCallback((counts: Record<string, number>) => {
    setKindCounts({
      all: counts.all ?? 0,
      text: counts.text ?? 0,
      link: counts.link ?? 0,
      file: counts.file ?? 0,
    })
  }, [])

  const reload = useCallback(async () => {
    const gen = ++requestGen.current
    setLoadError(null)
    try {
      const page = await fetchPage(0)
      if (gen !== requestGen.current) return
      setRows(page.items)
      setTotal(page.total)
      setHasMore(page.has_more)
      applyKindCounts(page.kind_counts)
    } catch (err) {
      if (gen !== requestGen.current) return
      setLoadError(err instanceof Error ? err.message : String(err))
      setRows([])
      setTotal(0)
      setHasMore(false)
    }
  }, [fetchPage, applyKindCounts])

  useEffect(() => {
    setRows(null)
    void reload()
  }, [reload])

  const loadMore = useCallback(async () => {
    if (rows == null || !hasMore || loadingMoreLock.current) return
    loadingMoreLock.current = true
    setLoadingMore(true)
    const gen = requestGen.current
    const offset = rows.length
    try {
      const page = await fetchPage(offset)
      if (gen !== requestGen.current) return
      setRows((prev) => (prev == null ? page.items : [...prev, ...page.items]))
      setTotal(page.total)
      setHasMore(page.has_more)
      applyKindCounts(page.kind_counts)
    } catch (err) {
      if (gen !== requestGen.current) return
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      loadingMoreLock.current = false
      setLoadingMore(false)
    }
  }, [rows, hasMore, fetchPage, applyKindCounts])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore || rows == null) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore()
      },
      { rootMargin: '240px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, rows, loadMore])

  const taskFallback = t('taskFallback')

  const groups = useMemo(
    () => (rows == null ? [] : groupArtifacts(rows, sort, taskFallback)),
    [rows, sort, taskFallback],
  )

  function toggleCollapsed(taskId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const hasFilters = query.trim() !== '' || kind !== 'all' || mineOnly || sort !== 'newest'
  const showToolbar = rows != null && (total > 0 || hasFilters || (rows?.length ?? 0) > 0)

  return (
    <main className="page">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {loadError && <Alert>{loadError}</Alert>}
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {showToolbar && (
        <div className="toolbar">
          <label className="search">
            <Icon name="search" />
            <input
              ref={searchRef}
              type="search"
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              aria-keyshortcuts="/"
              title={t('searchShortcut')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setQuery('')
                  e.currentTarget.blur()
                }
              }}
            />
            {!query && (
              <kbd className="kbd-hint" aria-hidden="true">
                /
              </kbd>
            )}
          </label>
          <label className="toolbar-sort">
            <span className="sr-only">{t('sortLabel')}</span>
            <select
              className="compact-select"
              value={sort}
              aria-label={t('sortLabel')}
              onChange={(e) => setSort(e.target.value as ArtifactSort)}
            >
              {ARTIFACT_SORTS.map((key) => (
                <option key={key} value={key}>
                  {t(`sort.${key}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="chips" role="tablist" aria-label={t('filterByKind')}>
            {ARTIFACT_KIND_FILTERS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={kind === key}
                className={kind === key ? 'chip active' : 'chip'}
                onClick={() => setKind(key)}
              >
                {key === 'all' ? t('kindAll') : t(`kind.${key}`)}
                <span className="chip-count">{kindCounts[key]}</span>
              </button>
            ))}
            {userId != null && (
              <button
                type="button"
                role="tab"
                aria-selected={mineOnly}
                className={mineOnly ? 'chip smart active' : 'chip smart'}
                onClick={() => setMineOnly((v) => !v)}
              >
                {t('mineOnly')}
              </button>
            )}
          </div>
        </div>
      )}

      {rows == null ? (
        !loadError && <Skeleton rows={5} />
      ) : total === 0 && !hasFilters ? (
        <EmptyState icon="paperclip" title={t('emptyTitle')}>
          {t('emptyHint')}
        </EmptyState>
      ) : total === 0 ? (
        <EmptyState icon="search" title={t('emptyNoMatch')}>
          {t('emptyNoMatchHint')}
        </EmptyState>
      ) : (
        <div className="artifacts-library">
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.taskId)
            const label = taskGroupLabel(group)
            return (
              <section key={group.taskId} className="artifact-group">
                <div className="artifact-group-header">
                  <button
                    type="button"
                    className="icon-btn ghost expand"
                    aria-label={
                      isCollapsed
                        ? t('expandGroup', { title: label })
                        : t('collapseGroup', { title: label })
                    }
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleCollapsed(group.taskId)}
                  >
                    <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={14} />
                  </button>
                  <Link to={`/tasks/${group.taskId}`} className="artifact-group-title">
                    {label}
                  </Link>
                  <span className="muted small artifact-group-count">
                    {t('groupCount', { count: group.artifacts.length })}
                  </span>
                </div>
                {!isCollapsed && (
                  <ul className="card list">
                    {group.artifacts.map((a) => (
                      <ArtifactRow
                        key={`${a.task_id}:${a.id}`}
                        artifact={a}
                        busy={busy}
                        run={run}
                        onDeleted={reload}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
          <div ref={sentinelRef} className="artifacts-scroll-sentinel" aria-hidden="true" />
          {loadingMore && (
            <p className="muted small artifacts-loading-more" role="status">
              {t('loadingMore')}
            </p>
          )}
          {!hasMore && rows.length > 0 && (
            <p className="muted small artifacts-end" role="status">
              {t('endOfList', { count: total })}
            </p>
          )}
        </div>
      )}
    </main>
  )
}
