import { useEffect } from 'react'
import type { Artifact } from '../api'
import { getArtifactPreviewKind } from './artifactMedia'
import {
  prefetchArtifactBlobs,
  retainArtifactBlobScope,
  type ArtifactBlobKey,
} from './artifactObjectUrlCache'

/** Images, documents, and audio warm up front; video streams on demand. */
function shouldPrefetch(artifact: Artifact): boolean {
  if (!artifact.storage_key) return false
  const kind = getArtifactPreviewKind(artifact)
  if (artifact.kind === 'link') return kind === 'image'
  if (artifact.kind !== 'file') return false
  return (
    kind === 'image' ||
    kind === 'pdf' ||
    kind === 'audio' ||
    kind === 'markdown' ||
    kind === 'text'
  )
}

/**
 * Keep the page's artifact blobs cached while mounted and warm the previewable ones,
 * so hover previews and inline cards render without re-fetching until the page is left.
 */
export function usePrefetchArtifactBlobs(scope: string, artifacts: Artifact[]) {
  useEffect(() => retainArtifactBlobScope(scope), [scope])

  useEffect(() => {
    const keys: ArtifactBlobKey[] = artifacts.filter(shouldPrefetch).map((art) => ({
      // `scope` is the real task id for authenticated pages, or `public:<token>` for guests.
      taskId: scope,
      artifactId: art.id,
      title: art.title,
      contentType: art.content_type,
    }))
    prefetchArtifactBlobs(keys)
  }, [artifacts, scope])
}
