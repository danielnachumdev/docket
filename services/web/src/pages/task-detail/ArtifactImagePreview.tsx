import { useEffect, useState } from 'react'
import { api } from '../../api'

type Props = {
  taskId: string
  artifactId: number
  title: string
}

export function ArtifactImagePreview({ taskId, artifactId, title }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setSrc(null)
    setError(null)
    void (async () => {
      try {
        const blob = await api.fetchArtifactContentBlob(taskId, artifactId, title)
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Preview failed')
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [taskId, artifactId, title])

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
    return <p className="muted small">Loading preview…</p>
  }

  return (
    <>
      <button
        type="button"
        className="artifact-preview-btn"
        onClick={() => setLightbox(true)}
        aria-label={`Enlarge ${title}`}
        title="Enlarge preview"
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
