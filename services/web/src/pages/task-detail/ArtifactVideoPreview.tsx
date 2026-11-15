import { useState } from 'react'
import { useArtifactObjectUrl } from '../../lib/useArtifactObjectUrl'
import { ArtifactEnlargeButton, ArtifactFullView } from './ArtifactFullView'
import { PreviewLoading } from './PreviewLoading'

type Props = {
  taskId: string
  artifactId: number
  title: string
  contentType: string | null
}

export function ArtifactVideoPreview({ taskId, artifactId, title, contentType }: Props) {
  const { src, error } = useArtifactObjectUrl({ taskId, artifactId, title, contentType })
  const [fullView, setFullView] = useState(false)

  if (error) {
    return <p className="muted small artifact-preview-error">{error}</p>
  }
  if (!src) {
    return <PreviewLoading />
  }

  return (
    <>
      <div className="artifact-preview-frame">
        <ArtifactEnlargeButton title={title} onClick={() => setFullView(true)} />
        <video className="artifact-preview-video" controls preload="metadata" src={src}>
          Your browser does not support video playback for {title}.
        </video>
      </div>
      {fullView && (
        <ArtifactFullView title={title} onClose={() => setFullView(false)} bodyClassName="artifact-fullview-media">
          <video className="artifact-fullview-video" controls autoPlay preload="metadata" src={src}>
            Your browser does not support video playback for {title}.
          </video>
        </ArtifactFullView>
      )}
    </>
  )
}
