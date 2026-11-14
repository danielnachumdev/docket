import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { api, type StorageOverview } from '../api'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import type { IconName } from '../components/Icon'
import { ListRow } from '../components/ListRow'
import { PageHeader } from '../components/PageHeader'
import { SectionHeading } from '../components/SectionHeading'
import { UserBidiText } from '../components/UserBidiText'
import { formatBytes } from '../lib/format'

type Props = {
  canAdmin?: boolean
}

const KIND_ICON: Record<string, IconName> = { file: 'file', link: 'link' }

function kindLabel(kind: string) {
  const key = `storage.kindLabel.${kind}`
  if (i18n.exists(key, { ns: 'integrations' })) {
    return i18n.t(key, { ns: 'integrations' })
  }
  return kind
}

export function StoragePage({ canAdmin = false }: Props) {
  const { t } = useTranslation(['integrations', 'common'])
  const [overview, setOverview] = useState<StorageOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!canAdmin) {
      setOverview(null)
      return
    }
    setOverview(await api.getAdminStorage())
  }, [canAdmin])

  useEffect(() => {
    load().catch((err: Error) => setError(err.message || t('storage.loadFailed')))
  }, [load, t])

  const usage = (row: { artifact_count: number; stored_bytes: number }) => [
    `${t('storage.count')}: ${row.artifact_count}`,
    `${t('storage.bytes')}: ${formatBytes(row.stored_bytes)}`,
  ]

  return (
    <main className="page narrow">
      <PageHeader title={t('storage.title')} subtitle={t('storage.subtitle')} />

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {!canAdmin && <Alert tone="info">{t('storage.ownerOnlyHint')}</Alert>}
      {canAdmin && <Alert tone="info">{t('storage.sizeNote')}</Alert>}

      {!canAdmin ? null : overview == null ? (
        <Skeleton rows={4} />
      ) : (
        <>
          <SectionHeading title={t('storage.totalsTitle')} />
          <div className="stat-grid">
            <div className="stat">
              <span className="muted small">{t('storage.totalArtifacts')}</span>
              <strong>{overview.artifact_count}</strong>
            </div>
            <div className="stat">
              <span className="muted small">{t('storage.totalBytes')}</span>
              <strong>{formatBytes(overview.stored_bytes)}</strong>
            </div>
          </div>

          <SectionHeading title={t('storage.byKindTitle')} count={overview.by_kind.length} />
          {overview.by_kind.length === 0 ? (
            <EmptyState icon="paperclip" title={t('storage.emptyUploadersTitle')}>
              {t('storage.emptyUploadersHint')}
            </EmptyState>
          ) : (
            <ul className="card list">
              {overview.by_kind.map((row) => (
                <ListRow
                  key={row.kind}
                  icon={KIND_ICON[row.kind] ?? 'text'}
                  title={kindLabel(row.kind)}
                  meta={usage(row)}
                />
              ))}
            </ul>
          )}

          <SectionHeading
            title={t('storage.uploadersTitle')}
            count={overview.by_uploader.length}
          />
          {overview.by_uploader.length === 0 ? (
            <EmptyState icon="users" title={t('storage.emptyUploadersTitle')}>
              {t('storage.emptyUploadersHint')}
            </EmptyState>
          ) : (
            <ul className="card list">
              {overview.by_uploader.map((row) => (
                <ListRow
                  key={row.user_id}
                  icon="users"
                  title={row.display_name}
                  meta={[row.email ?? t('common:emDash'), ...usage(row)]}
                />
              ))}
            </ul>
          )}

          <SectionHeading title={t('storage.topTasksTitle')} count={overview.top_tasks.length} />
          {overview.top_tasks.length === 0 ? (
            <p className="muted">{t('storage.emptyTopTasks')}</p>
          ) : (
            <ul className="card list">
              {overview.top_tasks.map((row) => (
                <ListRow
                  key={row.task_id}
                  icon="tasks"
                  title={
                    <Link to={`/tasks/${row.task_id}`} className="strong-link">
                      <UserBidiText text={`#${row.task_number} ${row.title}`} />
                    </Link>
                  }
                  meta={usage(row)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}
