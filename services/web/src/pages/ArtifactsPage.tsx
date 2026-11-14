import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, type Artifact } from '../api'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import { PageHeader } from '../components/PageHeader'
import { useAction } from '../lib/useAction'
import { ArtifactRow } from './task-detail/ArtifactRow'

export function ArtifactsPage() {
  const { t } = useTranslation('artifacts')
  const [rows, setRows] = useState<Artifact[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { busy, error, setError, run } = useAction()

  const load = useCallback(async () => {
    setRows(await api.listArtifacts())
  }, [])

  useEffect(() => {
    load().catch((err: Error) => setLoadError(err.message))
  }, [load])

  function taskLabel(artifact: Artifact) {
    const title = artifact.task_title?.trim() || t('taskFallback')
    return artifact.task_number != null ? `#${artifact.task_number} ${title}` : title
  }

  return (
    <main className="page">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {loadError && <Alert>{loadError}</Alert>}
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {rows == null ? (
        !loadError && <Skeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState icon="paperclip" title={t('emptyTitle')}>
          {t('emptyHint')}
        </EmptyState>
      ) : (
        <ul className="card list artifacts-library">
          {rows.map((a) => (
            <ArtifactRow
              key={`${a.task_id}:${a.id}`}
              artifact={a}
              busy={busy}
              run={run}
              onDeleted={load}
              context={
                <Link to={`/tasks/${a.task_id}`} className="task-chip-link">
                  {taskLabel(a)}
                </Link>
              }
            />
          ))}
        </ul>
      )}
    </main>
  )
}
