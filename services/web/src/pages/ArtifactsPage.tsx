import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Artifact } from '../api'
import { Alert, EmptyState, Skeleton } from '../components/Feedback'
import { Icon, type IconName } from '../components/Icon'
import { isImageArtifact } from '../lib/artifactMedia'
import { formatDateTime, formatRelative } from '../lib/format'
import { useAction } from '../lib/useAction'
import { ArtifactImagePreview } from './task-detail/ArtifactImagePreview'

const KIND_ICONS: Record<string, IconName> = {
  text: 'text',
  link: 'link',
  file: 'file',
  json: 'text',
}

function isUrl(value: string | null) {
  return value != null && /^https?:\/\//i.test(value.trim())
}

function taskLabel(artifact: Artifact) {
  const number = artifact.task_number != null ? `#${artifact.task_number}` : null
  const title = artifact.task_title?.trim() || 'Task'
  return number ? `${number} ${title}` : title
}

export function ArtifactsPage() {
  const [rows, setRows] = useState<Artifact[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { busy, error, setError, run } = useAction()

  const load = useCallback(async () => {
    setRows(await api.listArtifacts())
  }, [])

  useEffect(() => {
    load().catch((err: Error) => setLoadError(err.message))
  }, [load])

  function onDelete(artifact: Artifact) {
    if (!window.confirm(`Delete artifact “${artifact.title}”?`)) return
    void run(async () => {
      await api.deleteArtifact(artifact.task_id, artifact.id)
      await load()
    }, 'Could not delete artifact')
  }

  if (loadError) {
    return (
      <main className="page">
        <Alert>{loadError}</Alert>
      </main>
    )
  }

  if (!rows) {
    return (
      <main className="page">
        <Skeleton rows={5} />
      </main>
    )
  }

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>Artifacts</h1>
          <p className="muted">
            Notes, links, and files from tasks you can access. You can change or delete only what you
            uploaded.
          </p>
        </div>
      </header>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {rows.length === 0 ? (
        <EmptyState icon="paperclip" title="No artifacts yet">
          Attach notes, links, or files on a task — they will show up here.
        </EmptyState>
      ) : (
        <ul className="list artifacts-library">
          {rows.map((a) => (
            <li key={`${a.task_id}:${a.id}`} className="artifact">
              <div className="list-row">
                <span className="artifact-icon">
                  <Icon name={KIND_ICONS[a.kind] ?? 'file'} />
                </span>
                <span className="grow min-0">
                  <strong className="truncate block">{a.title}</strong>
                  <span className="muted small">
                    <Link to={`/tasks/${a.task_id}`} className="task-chip-link">
                      {taskLabel(a)}
                    </Link>
                    {' · '}
                    {a.kind}
                    {a.content_type && ` · ${a.content_type}`}
                    {' · '}
                    <span title={formatDateTime(a.created_at)}>{formatRelative(a.created_at)}</span>
                  </span>
                </span>
                <span className="row-actions">
                  {a.kind === 'link' && isUrl(a.content_text) && (
                    <a
                      className="icon-btn"
                      href={a.content_text!.trim()}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`Open ${a.title}`}
                      title="Open link"
                    >
                      <Icon name="external" />
                    </a>
                  )}
                  {(a.storage_key || a.content_text) && (
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={busy}
                      aria-label={`Download ${a.title}`}
                      title="Download"
                      onClick={() =>
                        void run(
                          () => api.downloadArtifactContent(a.task_id, a.id, a.title),
                          'Download failed',
                        )
                      }
                    >
                      <Icon name="download" />
                    </button>
                  )}
                  {a.can_modify && (
                    <button
                      type="button"
                      className="icon-btn danger"
                      disabled={busy}
                      aria-label={`Delete ${a.title}`}
                      title="Delete"
                      onClick={() => onDelete(a)}
                    >
                      <Icon name="trash" />
                    </button>
                  )}
                </span>
              </div>
              {a.content_text && a.kind !== 'file' && a.kind !== 'link' && (
                <details className="artifact-body">
                  <summary>Show content</summary>
                  <pre>{a.content_text}</pre>
                </details>
              )}
              {a.kind === 'link' && a.content_text && !isUrl(a.content_text) && (
                <p className="muted small break">{a.content_text}</p>
              )}
              {isImageArtifact(a) && (a.storage_key || a.content_text) && (
                <div className="artifact-body">
                  <ArtifactImagePreview taskId={a.task_id} artifactId={a.id} title={a.title} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
