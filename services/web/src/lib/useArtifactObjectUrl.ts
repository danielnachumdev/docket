import { useEffect, useState } from 'react'
import i18n from '../i18n'
import {
  loadArtifactBlob,
  peekArtifactBlob,
  type ArtifactBlobKey,
} from './artifactObjectUrlCache'

type Args = ArtifactBlobKey

type State = {
  src: string | null
  error: string | null
  blob: Blob | null
}

/** Resolves a blob object URL via the page-scoped cache (no re-fetch while warm). */
export function useArtifactObjectUrl({
  taskId,
  artifactId,
  title,
  contentType,
}: Args): State {
  const key = { taskId, artifactId, title, contentType }
  const cached = peekArtifactBlob(key)
  const [src, setSrc] = useState<string | null>(cached?.objectUrl ?? null)
  const [blob, setBlob] = useState<Blob | null>(cached?.blob ?? null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const request = { taskId, artifactId, title, contentType }
    const warm = peekArtifactBlob(request)
    if (warm) {
      setSrc(warm.objectUrl)
      setBlob(warm.blob)
      setError(null)
      return
    }
    setSrc(null)
    setBlob(null)
    setError(null)
    void loadArtifactBlob(request)
      .then((entry) => {
        if (cancelled) return
        setSrc(entry.objectUrl)
        setBlob(entry.blob)
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : i18n.t('previewFailed', { ns: 'artifacts' }),
        )
      })
    return () => {
      cancelled = true
    }
  }, [taskId, artifactId, title, contentType])

  return { src, error, blob }
}
