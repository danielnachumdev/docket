import { api } from '../api'
import { inferArtifactMediaType } from './artifactMedia'

export type ArtifactBlobKey = {
  taskId: string
  artifactId: number
  title: string
  contentType: string | null
}

export type ArtifactBlobEntry = {
  objectUrl: string
  blob: Blob
}

type Pending = {
  promise: Promise<ArtifactBlobEntry>
}

const ready = new Map<string, ArtifactBlobEntry>()
const pending = new Map<string, Pending>()

function cacheKey({ taskId, artifactId }: ArtifactBlobKey) {
  return `${taskId}:${artifactId}`
}

async function fetchEntry(key: ArtifactBlobKey): Promise<ArtifactBlobEntry> {
  const blob = await api.fetchArtifactContentBlob(key.taskId, key.artifactId, key.title)
  const inferred = inferArtifactMediaType({
    content_type: key.contentType,
    title: key.title,
  })
  const typed =
    inferred && (!blob.type || blob.type === 'application/octet-stream')
      ? new Blob([blob], { type: inferred })
      : blob
  return { objectUrl: URL.createObjectURL(typed), blob: typed }
}

/** Fetch once per task/artifact while the page keeps the cache warm. */
export function loadArtifactBlob(key: ArtifactBlobKey): Promise<ArtifactBlobEntry> {
  const id = cacheKey(key)
  const hit = ready.get(id)
  if (hit) return Promise.resolve(hit)
  const inflight = pending.get(id)
  if (inflight) return inflight.promise

  const promise = fetchEntry(key)
    .then((entry) => {
      ready.set(id, entry)
      pending.delete(id)
      return entry
    })
    .catch((err) => {
      pending.delete(id)
      throw err
    })
  pending.set(id, { promise })
  return promise
}

export function peekArtifactBlob(key: ArtifactBlobKey): ArtifactBlobEntry | null {
  return ready.get(cacheKey(key)) ?? null
}

/** Drop cached object URLs (call when leaving a task page). */
export function clearArtifactBlobCache() {
  for (const entry of ready.values()) {
    URL.revokeObjectURL(entry.objectUrl)
  }
  ready.clear()
  pending.clear()
}

export function prefetchArtifactBlobs(keys: ArtifactBlobKey[]) {
  for (const key of keys) {
    void loadArtifactBlob(key).catch(() => {
      /* prefetch is best-effort */
    })
  }
}
