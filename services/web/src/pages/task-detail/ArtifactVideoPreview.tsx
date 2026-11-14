import { useArtifactObjectUrl } from '../../lib/useArtifactObjectUrl'

type Props = {
  taskId: string
  artifactId: number
  title: string
  contentType: string | null
}

export function ArtifactVideoPreview({ taskId, artifactId, title, contentType }: Props) {
  const { src, error } = useArtifactObjectUrl({ taskId, artifactId, title, contentType })

  if (error) {
    return <p className="muted small artifact-preview-error">{error}</p>
  }
  if (!src) {
    return <p className="muted small">Loading preview…</p>
  }

  return (
    <video className="artifact-preview-video" controls preload="metadata" src={src}>
      Your browser does not support video playback for {title}.
    </video>
  )
}
