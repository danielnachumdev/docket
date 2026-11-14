import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Artifact } from '../../api'
import { Icon } from '../../components/Icon'
import { artifactKindIcon } from '../../lib/artifactMedia'
import { useConfirm } from '../../lib/dialogs'
import { formatDateTime, formatRelative, humanize } from '../../lib/format'
import { ArtifactFilePreview } from './ArtifactFilePreview'

function isUrl(value: string | null) {
  return value != null && /^https?:\/\//i.test(value.trim())
}

type Props = {
  artifact: Artifact
  busy: boolean
  run: (fn: () => Promise<unknown>, fallback?: string) => Promise<boolean>
  onDeleted: () => Promise<void>
  context?: ReactNode
}

export function ArtifactRow({ artifact: a, busy, run, onDeleted, context }: Props) {
  const { t } = useTranslation('artifacts')
  const confirm = useConfirm()
  const kindKey = `kind.${a.kind}`
  const kindLabel = t(kindKey, { defaultValue: humanize(a.kind) })

  async function onDelete() {
    const ok = await confirm({
      title: t('deleteTitle'),
      description: t('deleteBody', { title: a.title }),
      confirmLabel: t('common:delete'),
      danger: true,
    })
    if (!ok) return
    await run(async () => {
      await api.deleteArtifact(a.task_id, a.id)
      await onDeleted()
    }, t('errors.delete'))
  }

  return (
    <li id={`artifact-${a.id}`} className="artifact">
      <div className="list-row">
        <span className="artifact-icon">
          <Icon name={artifactKindIcon(a.kind)} />
        </span>
        <span className="grow min-0">
          <strong className="truncate block">{a.title}</strong>
          <span className="muted small meta-line">
            {context}
            <span>{kindLabel}</span>
            {a.content_type && <span className="hide-mobile">{a.content_type}</span>}
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
              aria-label={t('openNamed', { title: a.title })}
              title={t('openLink')}
            >
              <Icon name="external" />
            </a>
          )}
          {(a.storage_key || a.content_text) && (
            <button
              type="button"
              className="icon-btn"
              disabled={busy}
              aria-label={t('downloadNamed', { title: a.title })}
              title={t('common:download')}
              onClick={() =>
                void run(
                  () => api.downloadArtifactContent(a.task_id, a.id, a.title),
                  t('errors.download'),
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
              aria-label={t('deleteNamed', { title: a.title })}
              title={t('common:delete')}
              onClick={() => void onDelete()}
            >
              <Icon name="trash" />
            </button>
          )}
        </span>
      </div>
      {a.content_text && a.kind !== 'file' && a.kind !== 'link' && (
        <details className="artifact-body">
          <summary>{t('showContent')}</summary>
          <pre>{a.content_text}</pre>
        </details>
      )}
      {a.kind === 'link' && a.content_text && !isUrl(a.content_text) && (
        <p className="muted small break artifact-body">{a.content_text}</p>
      )}
      <ArtifactFilePreview taskId={a.task_id} artifact={a} />
    </li>
  )
}
