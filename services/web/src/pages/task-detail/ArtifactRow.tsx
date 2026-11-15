import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Artifact } from '../../api'
import { Icon } from '../../components/Icon'
import { UserBidiText } from '../../components/UserBidiText'
import { artifactKindIcon } from '../../lib/artifactMedia'
import { artifactDisplayBytes } from '../../lib/artifactsLibrary'
import { useConfirm } from '../../lib/dialogs'
import { formatBytes, formatDateTime, formatRelative, humanize } from '../../lib/format'
import { ArtifactEnlargeButton, ArtifactFullView } from './ArtifactFullView'
import { ArtifactFilePreview } from './ArtifactFilePreview'
import './ArtifactRow.css'

function isUrl(value: string | null) {
  return value != null && /^https?:\/\//i.test(value.trim())
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

type Props = {
  artifact: Artifact
  busy: boolean
  run: (fn: () => Promise<unknown>, fallback?: string) => Promise<boolean>
  onDeleted: () => Promise<void>
  context?: ReactNode
  layout?: 'list' | 'grid'
}

export function ArtifactRow({
  artifact: a,
  busy,
  run,
  onDeleted,
  context,
  layout = 'list',
}: Props) {
  const { t } = useTranslation('artifacts')
  const confirm = useConfirm()
  const [textFullView, setTextFullView] = useState(false)
  const screenshotInputRef = useRef<HTMLInputElement>(null)
  const kindKey = `kind.${a.kind}`
  const kindLabel = t(kindKey, { defaultValue: humanize(a.kind) })
  const sizeBytes = artifactDisplayBytes(a)
  const showTextBody = Boolean(a.content_text && a.kind !== 'file' && a.kind !== 'link')
  const isLink = a.kind === 'link'
  const hasScreenshot = Boolean(isLink && a.storage_key)
  const isGrid = layout === 'grid'

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

  async function onRemoveScreenshot() {
    const ok = await confirm({
      title: t('removeScreenshotTitle'),
      description: t('removeScreenshotBody', { title: a.title }),
      confirmLabel: t('removeScreenshot'),
      danger: true,
    })
    if (!ok) return
    await run(async () => {
      await api.updateArtifact(a.task_id, a.id, { clear_blob: true })
      await onDeleted()
    }, t('errors.removeScreenshot'))
  }

  async function onScreenshotSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!file) return
    if (file.type && !file.type.startsWith('image/')) {
      await run(async () => {
        throw new Error(t('errors.screenshotImage'))
      }, t('errors.screenshot'))
      return
    }
    await run(async () => {
      await api.updateArtifact(a.task_id, a.id, {
        content_base64: await fileToBase64(file),
        content_type: file.type || 'image/png',
      })
      await onDeleted()
    }, t('errors.screenshot'))
  }

  const actions = (
    <span className={isGrid ? 'row-actions artifact-card-actions' : 'row-actions'}>
      {isLink && isUrl(a.content_text) && (
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
      {a.can_modify && isLink && (
        <>
          <input
            ref={screenshotInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => void onScreenshotSelected(e)}
          />
          <button
            type="button"
            className="icon-btn"
            disabled={busy}
            aria-label={
              hasScreenshot
                ? t('replaceScreenshotNamed', { title: a.title })
                : t('attachScreenshotNamed', { title: a.title })
            }
            title={hasScreenshot ? t('replaceScreenshot') : t('attachScreenshot')}
            onClick={() => screenshotInputRef.current?.click()}
          >
            <Icon name="paperclip" />
          </button>
          {hasScreenshot && (
            <button
              type="button"
              className="icon-btn"
              disabled={busy}
              aria-label={t('removeScreenshotNamed', { title: a.title })}
              title={t('removeScreenshot')}
              onClick={() => void onRemoveScreenshot()}
            >
              <Icon name="x" />
            </button>
          )}
        </>
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
  )

  const meta = (
    <span className={isGrid ? 'muted small meta-line artifact-card-meta' : 'muted small meta-line'}>
      {context}
      <span>{kindLabel}</span>
      {!isGrid && a.content_type && <span className="hide-mobile">{a.content_type}</span>}
      <span title={t('sizeBytes', { count: sizeBytes })}>{formatBytes(sizeBytes)}</span>
      <span title={formatDateTime(a.created_at)}>{formatRelative(a.created_at)}</span>
    </span>
  )

  return (
    <li id={`artifact-${a.id}`} className={isGrid ? 'artifact artifact-card' : 'artifact'}>
      {isGrid ? (
        <div className="artifact-card-head">
          <span className="row-icon">
            <Icon name={artifactKindIcon(a.kind)} />
          </span>
          <div className="artifact-card-copy min-0">
            <UserBidiText text={a.title} as="strong" className="truncate block" />
            {meta}
          </div>
        </div>
      ) : (
        <div className="list-row">
          <span className="row-icon">
            <Icon name={artifactKindIcon(a.kind)} />
          </span>
          <span className="grow min-0">
            <UserBidiText text={a.title} as="strong" className="truncate block" />
            {meta}
          </span>
          {actions}
        </div>
      )}
      {showTextBody && a.content_text && (
        <div className="artifact-body">
          <div className="artifact-preview-frame artifact-text-preview">
            <ArtifactEnlargeButton title={a.title} onClick={() => setTextFullView(true)} />
            <UserBidiText text={a.content_text} as="pre" />
          </div>
        </div>
      )}
      {isLink && a.content_text && !isUrl(a.content_text) && (
        <UserBidiText
          text={a.content_text}
          as="p"
          className="muted small break artifact-body"
        />
      )}
      <ArtifactFilePreview taskId={a.task_id} artifact={a} />
      {isGrid && actions}
      {textFullView && a.content_text && (
        <ArtifactFullView
          title={a.title}
          onClose={() => setTextFullView(false)}
          bodyClassName="artifact-fullview-text"
        >
          <UserBidiText text={a.content_text} as="pre" />
        </ArtifactFullView>
      )}
    </li>
  )
}
