import { useEffect } from 'react'
import type { Artifact } from '../api'
import { getArtifactPreviewKind } from './artifactMedia'
import {
  clearArtifactBlobCache,
  prefetchArtifactBlobs,
  type ArtifactBlobKey,
} from './artifactObjectUrlCache'

function shouldPrefetch(artifact: Artifact): boolean {
  if (artifact.kind === 'link') return false
  if (artifact.kind === 'text' || artifact.kind === 'json') return true
  if (artifact.kind !== 'file' || !artifact.storage_key) return false
  const kind = getArtifactPreviewKind(artifact)
  return (
    kind === 'image' ||
    kind === 'pdf' ||
    kind === 'audio' ||
    kind === 'video' ||
    kind === 'markdown' ||
    kind === 'text'
  )
}

/** Warm the blob cache for comment/timeline media; clear when leaving the task. */
export function usePrefetchArtifactBlobs(taskId: string, artifacts: Artifact[]) {
  useEffect(() => {
    const keys: ArtifactBlobKey[] = artifacts.filter(shouldPrefetch).map((art) => ({
      taskId,
      artifactId: art.id,
      title: art.title,
      contentType: art.content_type,
    }))
    prefetchArtifactBlobs(keys)
  }, [taskId, artifacts])

  useEffect(() => {
    return () => clearArtifactBlobCache()
  }, [taskId])
}
