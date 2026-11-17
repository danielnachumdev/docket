import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Artifact } from '../../api'
import { Icon } from '../../components/Icon'
import { externalLinkUrl, getArtifactPreviewKind } from '../../lib/artifactMedia'
import { userBidiAttrs } from '../../lib/bidi'
import { hostnameOf, renderMarkdown } from '../../lib/markdown'
import { useArtifactObjectUrl } from '../../lib/useArtifactObjectUrl'
import { useArtifactText } from '../../lib/useArtifactText'
import { ArtifactFullView } from './ArtifactFullView'
import { PreviewLoading } from './PreviewLoading'
import '../../components/MarkdownView.css'
import './ArtifactLightbox.css'

type Props = {
  taskId: string
  artifact: Artifact
  onClose: () => void
}

function bodyClassFor(artifact: Artifact) {
  if (artifact.kind === 'text' || artifact.kind === 'json') return 'artifact-fullview-text'
  switch (getArtifactPreviewKind(artifact)) {
    case 'pdf':
      return 'artifact-fullview-pdf'
    case 'markdown':
      return 'artifact-fullview-md'
    case 'text':
      return 'artifact-fullview-text'
    default:
      return 'artifact-fullview-media'
  }
}

function BlobBody({ taskId, artifact }: { taskId: string; artifact: Artifact }) {
  const key = {
    taskId,
    artifactId: artifact.id,
    title: artifact.title,
    contentType: artifact.content_type,
  }
  const { src, error } = useArtifactObjectUrl(key)
  if (error) return <p className="muted small artifact-preview-error">{error}</p>
  if (!src) return <PreviewLoading />
  switch (getArtifactPreviewKind(artifact)) {
    case 'image':
      return <img src={src} alt={artifact.title} className="artifact-fullview-img" />
    case 'pdf':
      return <iframe className="artifact-fullview-pdf-frame" src={src} title={artifact.title} />
    case 'video':
      return <video className="artifact-fullview-video" controls autoPlay preload="auto" src={src} />
    case 'audio':
      return (
        <div className="artifact-lightbox-audio">
          <Icon name="file" size={28} />
          <audio controls autoPlay preload="auto" src={src} />
        </div>
      )
    default:
      return null
  }
}

function TextBody({ taskId, artifact }: { taskId: string; artifact: Artifact }) {
  const markdown = getArtifactPreviewKind(artifact) === 'markdown'
  const state = useArtifactText({
    taskId,
    artifactId: artifact.id,
    title: artifact.title,
    contentType: artifact.content_type,
  })
  const source = state.status === 'ready' ? state.text : ''
  const html = useMemo(() => (markdown ? renderMarkdown(source) : ''), [markdown, source])
  if (state.status === 'error') return <p className="muted small artifact-preview-error">{state.message}</p>
  if (state.status === 'loading') return <PreviewLoading />
  if (markdown) {
    return (
      <div
        {...userBidiAttrs(source, 'wm-md artifact-preview-md')}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }
  return (
    <pre className="user-bidi" dir="auto">
      {source}
    </pre>
  )
}

/** Full-size view of any artifact: media plays, documents read, link screenshots enlarge. */
export function ArtifactLightbox({ taskId, artifact, onClose }: Props) {
  const { t } = useTranslation('artifacts')
  const inline = artifact.kind === 'text' || artifact.kind === 'json'
  const kind = getArtifactPreviewKind(artifact)
  const linkUrl = externalLinkUrl(artifact)

  return (
    <ArtifactFullView title={artifact.title} onClose={onClose} bodyClassName={bodyClassFor(artifact)}>
      {inline ? (
        <pre className="user-bidi" dir="auto">
          {artifact.content_text}
        </pre>
      ) : kind === 'markdown' || kind === 'text' ? (
        <TextBody taskId={taskId} artifact={artifact} />
      ) : (
        <BlobBody taskId={taskId} artifact={artifact} />
      )}
      {linkUrl && (
        <a className="artifact-lightbox-link" href={linkUrl} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size={14} />
          {t('openOn', { host: hostnameOf(linkUrl) })}
        </a>
      )}
    </ArtifactFullView>
  )
}
