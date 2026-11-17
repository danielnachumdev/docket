import { api } from '../api'
import { inferArtifactMediaType } from './artifactMedia'
import { createBlobCache, type BlobCacheEntry, type BlobCacheKey } from './blobCache'

export { ALL_TASKS_SCOPE } from './blobCache'
export type ArtifactBlobKey = BlobCacheKey
export type ArtifactBlobEntry = BlobCacheEntry

const EVICT_DELAY_MS = 50

const cache = createBlobCache({
  fetchBlob: async (key) => {
    const blob = await api.fetchArtifactContentBlob(key.taskId, key.artifactId, key.title)
    const inferred = inferArtifactMediaType({ content_type: key.contentType, title: key.title })
    return inferred && (!blob.type || blob.type === 'application/octet-stream')
      ? new Blob([blob], { type: inferred })
      : blob
  },
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  schedule: (fn) => window.setTimeout(fn, EVICT_DELAY_MS),
})

export const loadArtifactBlob = cache.load
export const loadArtifactText = cache.loadText
export const peekArtifactBlob = cache.peek
export const prefetchArtifactBlobs = cache.prefetch
export const retainArtifactBlobScope = cache.retainScope
export const clearArtifactBlobCache = cache.clear
