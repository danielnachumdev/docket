import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useArtifactObjectUrl } from '../../lib/useArtifactObjectUrl'
import { PreviewLoading } from './PreviewLoading'

type Props = {
  taskId: string
  artifactId: number
  title: string
  contentType: string | null
}

export function ArtifactImagePreview({ taskId, artifactId, title, contentType }: Props) {
  const { t } = useTranslation('artifacts')
  const { src, error } = useArtifactObjectUrl({ taskId, artifactId, title, contentType })
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    if (!lightbox) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

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
        onClick={() => setLightbox(true)}
        aria-label={t('enlargeNamed', { title })}
        title={t('enlarge')}
      >
        <img className="artifact-preview" src={src} alt={title} />
      </button>
      {lightbox && (
        <div
          className="artifact-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={() => setLightbox(false)}
        >
          <img src={src} alt={title} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  )
}
