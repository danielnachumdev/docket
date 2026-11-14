import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { api, type StorageOverview } from '../api'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { formatBytes } from '../lib/format'

type Props = {
  canAdmin?: boolean
}

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

  return (
    <main className="page narrow">
      <PageHeader title={t('storage.title')} subtitle={t('storage.subtitle')} />

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {!canAdmin && <Alert>{t('storage.ownerOnlyHint')}</Alert>}
      {canAdmin && <p className="muted small storage-size-note">{t('storage.sizeNote')}</p>}

      {!canAdmin ? null : overview == null ? (
        <Skeleton rows={4} />
      ) : (
        <>
          <div className="section-head">
            <h2>{t('storage.totalsTitle')}</h2>
          </div>
          <div className="storage-stats">
            <div className="storage-stat">
              <span className="muted small">{t('storage.totalArtifacts')}</span>
              <strong>{overview.artifact_count}</strong>
            </div>
            <div className="storage-stat">
              <span className="muted small">{t('storage.totalBytes')}</span>
              <strong>{formatBytes(overview.stored_bytes)}</strong>
            </div>
          </div>

          <div className="section-head">
            <h2>{t('storage.byKindTitle')}</h2>
          </div>
          {overview.by_kind.length === 0 ? (
            <EmptyState icon="paperclip" title={t('storage.emptyUploadersTitle')}>
              {t('storage.emptyUploadersHint')}
            </EmptyState>
          ) : (
            <ul className="card list">
              {overview.by_kind.map((row) => (
                <li key={row.kind} className="list-row">
                  <span className="artifact-icon">
                    <Icon name={row.kind === 'file' ? 'file' : row.kind === 'link' ? 'link' : 'text'} />
                  </span>
                  <span className="grow min-0">
                    <strong className="block truncate">{kindLabel(row.kind)}</strong>
                    <span className="muted small meta-line">
                      <span>
                        {t('storage.count')}: {row.artifact_count}
                      </span>
                      <span>
                        {t('storage.bytes')}: {formatBytes(row.stored_bytes)}
                      </span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="section-head">
            <h2>{t('storage.uploadersTitle')}</h2>
          </div>
          {overview.by_uploader.length === 0 ? (
            <EmptyState icon="users" title={t('storage.emptyUploadersTitle')}>
              {t('storage.emptyUploadersHint')}
            </EmptyState>
          ) : (
            <ul className="card list">
              {overview.by_uploader.map((row) => (
                <li key={row.user_id} className="list-row">
                  <span className="artifact-icon">
                    <Icon name="users" />
                  </span>
                  <span className="grow min-0">
                    <strong className="block truncate">{row.display_name}</strong>
                    <span className="muted small meta-line">
                      <span>{row.email ?? t('common:emDash')}</span>
                      <span>
                        {t('storage.count')}: {row.artifact_count}
                      </span>
                      <span>
                        {t('storage.bytes')}: {formatBytes(row.stored_bytes)}
                      </span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="section-head">
            <h2>{t('storage.topTasksTitle')}</h2>
          </div>
          {overview.top_tasks.length === 0 ? (
            <p className="muted">{t('storage.emptyTopTasks')}</p>
          ) : (
            <ul className="card list">
              {overview.top_tasks.map((row) => (
                <li key={row.task_id} className="list-row">
                  <span className="artifact-icon">
                    <Icon name="tasks" />
                  </span>
                  <span className="grow min-0">
                    <Link to={`/tasks/${row.task_id}`} className="block truncate strong-link">
                      <strong>
                        #{row.task_number} {row.title}
                      </strong>
                    </Link>
                    <span className="muted small meta-line">
                      <span>
                        {t('storage.count')}: {row.artifact_count}
                      </span>
                      <span>
                        {t('storage.bytes')}: {formatBytes(row.stored_bytes)}
                      </span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}
