import { useEffect, useState } from 'react'
import { api } from '../api'
import i18n from '../i18n'
import { inferArtifactMediaType } from './artifactMedia'

type Args = {
  taskId: string
  artifactId: number
  title: string
  contentType: string | null
}

type State = {
  src: string | null
  error: string | null
}

export function useArtifactObjectUrl({
  taskId,
  artifactId,
  title,
  contentType,
}: Args): State {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setSrc(null)
    setError(null)
    void (async () => {
      try {
        const blob = await api.fetchArtifactContentBlob(taskId, artifactId, title)
        if (cancelled) return
        const inferred = inferArtifactMediaType({ content_type: contentType, title })
        const typed =
          inferred && (!blob.type || blob.type === 'application/octet-stream')
            ? new Blob([blob], { type: inferred })
            : blob
        objectUrl = URL.createObjectURL(typed)
        setSrc(objectUrl)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : i18n.t('previewFailed', { ns: 'artifacts' }))
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [taskId, artifactId, title, contentType])

  return { src, error }
}
