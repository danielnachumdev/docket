import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useArtifactObjectUrl } from '../../lib/useArtifactObjectUrl'
import { ArtifactFullView } from './ArtifactFullView'
import { PreviewLoading } from './PreviewLoading'
import './ArtifactImagePreview.css'

type Props = {
  taskId: string
  artifactId: number
  title: string
  contentType: string | null
}

export function ArtifactImagePreview({ taskId, artifactId, title, contentType }: Props) {
  const { t } = useTranslation('artifacts')
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
      <button
        type="button"
        className="artifact-preview-btn"
        onClick={() => setFullView(true)}
        aria-label={t('enlargeNamed', { title })}
        title={t('enlarge')}
      >
        <img className="artifact-preview" src={src} alt={title} />
      </button>
      {fullView && (
        <ArtifactFullView title={title} onClose={() => setFullView(false)} bodyClassName="artifact-fullview-media">
          <img src={src} alt={title} className="artifact-fullview-img" />
        </ArtifactFullView>
      )}
    </>
  )
}
