import {
  getArtifactPreviewKind,
  type ArtifactPreviewKind,
} from '../../lib/artifactMedia'
import { ArtifactAudioPreview } from './ArtifactAudioPreview'
import { ArtifactImagePreview } from './ArtifactImagePreview'
import { ArtifactMarkdownPreview } from './ArtifactMarkdownPreview'
import { ArtifactPdfPreview } from './ArtifactPdfPreview'
import { ArtifactPlainTextPreview } from './ArtifactPlainTextPreview'
import { ArtifactVideoPreview } from './ArtifactVideoPreview'
import './ArtifactFilePreview.css'

type ArtifactLike = {
  id: number
  kind: string
  title: string
  content_type: string | null
  storage_key: string | null
  content_text: string | null
}

type Props = {
  taskId: string
  artifact: ArtifactLike
}

function hasContent(artifact: ArtifactLike): boolean {
  return Boolean(artifact.storage_key || artifact.content_text)
}

function PreviewBody({
  kind,
  taskId,
  artifact,
}: {
  kind: ArtifactPreviewKind
  taskId: string
  artifact: ArtifactLike
}) {
  const common = {
    taskId,
    artifactId: artifact.id,
    title: artifact.title,
    contentType: artifact.content_type,
  }
  switch (kind) {
    case 'image':
      return <ArtifactImagePreview {...common} />
    case 'pdf':
      return <ArtifactPdfPreview {...common} />
    case 'audio':
      return <ArtifactAudioPreview {...common} />
    case 'video':
      return <ArtifactVideoPreview {...common} />
    case 'markdown':
      return <ArtifactMarkdownPreview {...common} />
    case 'text':
      return <ArtifactPlainTextPreview {...common} />
  }
}

export function ArtifactFilePreview({ taskId, artifact }: Props) {
  if (!hasContent(artifact)) return null
  if (artifact.kind === 'link') {
    if (!artifact.storage_key) return null
    const kind = getArtifactPreviewKind(artifact)
    if (kind !== 'image') return null
    return (
      <div className="artifact-body">
        <PreviewBody kind="image" taskId={taskId} artifact={artifact} />
      </div>
    )
  }
  if (artifact.kind !== 'file') return null
  const kind = getArtifactPreviewKind(artifact)
  if (!kind) return null
  return (
    <div className="artifact-body">
      <PreviewBody kind={kind} taskId={taskId} artifact={artifact} />
    </div>
  )
}
