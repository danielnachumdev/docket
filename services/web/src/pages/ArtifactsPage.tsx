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
  filterArtifacts,
  groupArtifacts,
  taskGroupLabel,
  type ArtifactKindFilter,
  type ArtifactSort,
} from '../lib/artifactsLibrary'
import { useAction } from '../lib/useAction'
import { useKeyboardShortcut } from '../lib/useKeyboardShortcut'
import { ArtifactRow } from './task-detail/ArtifactRow'

export function ArtifactsPage() {
  const { t } = useTranslation('artifacts')
  const { status: auth } = useAuth()
  const userId = auth?.user?.id ?? null
  const [rows, setRows] = useState<Artifact[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<ArtifactKindFilter>('all')
  const [sort, setSort] = useState<ArtifactSort>('newest')
  const [mineOnly, setMineOnly] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const { busy, error, setError, run } = useAction()
  const searchRef = useRef<HTMLInputElement>(null)

  useKeyboardShortcut('/', () => searchRef.current?.focus())

  const load = useCallback(async () => {
    setRows(await api.listArtifacts())
  }, [])

  useEffect(() => {
    load().catch((err: Error) => setLoadError(err.message))
  }, [load])

  const taskFallback = t('taskFallback')

  const filtered = useMemo(() => {
    if (rows == null) return []
    return filterArtifacts(rows, { kind, query, mineOnly, userId, taskFallback })
  }, [rows, kind, query, mineOnly, userId, taskFallback])

  const groups = useMemo(
    () => groupArtifacts(filtered, sort, taskFallback),
    [filtered, sort, taskFallback],
  )

  const kindCounts = useMemo(() => {
    const base =
      rows == null
        ? []
        : filterArtifacts(rows, {
            kind: 'all',
            query,
            mineOnly,
            userId,
            taskFallback,
          })
    const counts: Record<ArtifactKindFilter, number> = {
      all: base.length,
      text: 0,
      link: 0,
      file: 0,
    }
    for (const a of base) {
      if (a.kind === 'text' || a.kind === 'link' || a.kind === 'file') {
        counts[a.kind] += 1
      }
    }
    return counts
  }, [rows, query, mineOnly, userId, taskFallback])

  function toggleCollapsed(taskId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const hasFilters = query.trim() !== '' || kind !== 'all' || mineOnly || sort !== 'newest'
  const showToolbar = rows != null && (rows.length > 0 || hasFilters)

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
      ) : rows.length === 0 ? (
        <EmptyState icon="paperclip" title={t('emptyTitle')}>
          {t('emptyHint')}
        </EmptyState>
      ) : filtered.length === 0 ? (
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
                        onDeleted={load}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
