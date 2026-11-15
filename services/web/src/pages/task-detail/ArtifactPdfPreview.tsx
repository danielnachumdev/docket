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

export function ArtifactPdfPreview({ taskId, artifactId, title, contentType }: Props) {
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
        <iframe className="artifact-preview-pdf" src={src} title={title} />
      </div>
      {fullView && (
        <ArtifactFullView title={title} onClose={() => setFullView(false)} bodyClassName="artifact-fullview-pdf">
          <iframe className="artifact-fullview-pdf-frame" src={src} title={title} />
        </ArtifactFullView>
      )}
    </>
  )
}
