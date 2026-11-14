import { useArtifactObjectUrl } from '../../lib/useArtifactObjectUrl'
import { PreviewLoading } from './PreviewLoading'

type Props = {
  taskId: string
  artifactId: number
  title: string
  contentType: string | null
}

export function ArtifactPdfPreview({ taskId, artifactId, title, contentType }: Props) {
  const { src, error } = useArtifactObjectUrl({ taskId, artifactId, title, contentType })

  if (error) {
    return <p className="muted small artifact-preview-error">{error}</p>
  }
  if (!src) {
    return <PreviewLoading />
  }

  return (
    <iframe
      className="artifact-preview-pdf"
      src={src}
      title={title}
    />
  )
}
