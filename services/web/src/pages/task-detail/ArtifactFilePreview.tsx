import {
  getArtifactPreviewKind,
  type ArtifactPreviewKind,
} from '../../lib/artifactMedia'
import { ArtifactAudioPreview } from './ArtifactAudioPreview'
import { ArtifactImagePreview } from './ArtifactImagePreview'
import { ArtifactMarkdownPreview } from './ArtifactMarkdownPreview'
import { ArtifactPdfPreview } from './ArtifactPdfPreview'
import { ArtifactVideoPreview } from './ArtifactVideoPreview'

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
      return (
        <ArtifactMarkdownPreview
          taskId={taskId}
          artifactId={artifact.id}
          title={artifact.title}
        />
      )
  }
}

export function ArtifactFilePreview({ taskId, artifact }: Props) {
  if (artifact.kind !== 'file' || !hasContent(artifact)) return null
  const kind = getArtifactPreviewKind(artifact)
  if (!kind) return null
  return (
    <div className="artifact-body">
      <PreviewBody kind={kind} taskId={taskId} artifact={artifact} />
    </div>
  )
}
