import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Artifact } from '../../api'
import { Icon } from '../../components/Icon'
import { externalLinkUrl, getArtifactPreviewKind } from '../../lib/artifactMedia'
import { userBidiAttrs } from '../../lib/bidi'
import { hostnameOf, renderMarkdown } from '../../lib/markdown'
import { useArtifactObjectUrl } from '../../lib/useArtifactObjectUrl'
import { useArtifactText } from '../../lib/useArtifactText'
import { PreviewLoading } from './PreviewLoading'
import '../../components/MarkdownView.css'
import './ArtifactHoverPreview.css'

const SNIPPET_CHARS = 600

type Props = {
  taskId: string
  artifact: Artifact
}

function snippet(text: string) {
  return text.length > SNIPPET_CHARS ? `${text.slice(0, SNIPPET_CHARS)}…` : text
}

function TextMedia({ taskId, artifact }: Props) {
  const markdown = getArtifactPreviewKind(artifact) === 'markdown'
  const state = useArtifactText({
    taskId,
    artifactId: artifact.id,
    title: artifact.title,
    contentType: artifact.content_type,
  })
  const source = state.status === 'ready' ? snippet(state.text) : ''
  const html = useMemo(() => (markdown ? renderMarkdown(source) : ''), [markdown, source])
  if (state.status === 'error') return <p className="muted small">{state.message}</p>
  if (state.status === 'loading') return <PreviewLoading />
  if (markdown) {
    return (
      <div
        {...userBidiAttrs(source, 'wm-md hover-media-doc')}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }
  return (
    <pre className="hover-media-text" dir="auto">
      {source}
    </pre>
  )
}

function BlobMedia({ taskId, artifact }: Props) {
  const { src, error } = useArtifactObjectUrl({
    taskId,
    artifactId: artifact.id,
    title: artifact.title,
    contentType: artifact.content_type,
  })
  if (error) return <p className="muted small">{error}</p>
  if (!src) return <PreviewLoading />
  switch (getArtifactPreviewKind(artifact)) {
    case 'image':
      return <img className="hover-media-img" src={src} alt={artifact.title} />
    case 'audio':
      return <audio className="hover-media-audio" controls preload="metadata" src={src} />
    case 'video':
      return <video className="hover-media-video" controls preload="metadata" src={src} />
    case 'pdf':
      return (
        <iframe
          className="hover-media-pdf"
          title={artifact.title}
          src={`${src}#toolbar=0&navpanes=0&view=FitH`}
        />
      )
    default:
      return null
  }
}

function hintKey(artifact: Artifact) {
  if (externalLinkUrl(artifact)) return 'refPreview.clickLink'
  const kind = getArtifactPreviewKind(artifact)
  if (kind === 'audio' || kind === 'video') return 'refPreview.clickPlay'
  return 'refPreview.clickOpen'
}

export function ArtifactHoverPreview({ taskId, artifact }: Props) {
  const { t } = useTranslation(['tasks', 'artifacts'])
  const inline = artifact.kind === 'text' || artifact.kind === 'json'
  const kind = getArtifactPreviewKind(artifact)
  const link = externalLinkUrl(artifact)
  const typeLabel = link
    ? hostnameOf(link)
    : t(`artifacts:kind.${artifact.kind}`, { defaultValue: artifact.kind })

  return (
    <>
      <div className="hover-media">
        {inline ? (
          <pre className="hover-media-text" dir="auto">
            {snippet(artifact.content_text ?? '')}
          </pre>
        ) : kind === 'markdown' || kind === 'text' ? (
          <TextMedia taskId={taskId} artifact={artifact} />
        ) : (
          <BlobMedia taskId={taskId} artifact={artifact} />
        )}
      </div>
      <footer className="hover-card-foot">
        <Icon name={link ? 'link' : 'paperclip'} size={12} />
        <span className="hover-card-title truncate">{artifact.title}</span>
        <span className="muted">{typeLabel}</span>
      </footer>
      <p className="hover-card-hint muted">
        {t(hintKey(artifact), { host: link ? hostnameOf(link) : '' })}
      </p>
    </>
  )
}
