export const ALL_TASKS_SCOPE: '*'

export type BlobCacheKey = {
  taskId: string
  artifactId: number
  title: string
  contentType: string | null
}

export type BlobCacheEntry = {
  objectUrl: string
  blob: Blob
}

export type BlobCache = {
  load(key: BlobCacheKey): Promise<BlobCacheEntry>
  loadText(key: BlobCacheKey): Promise<string>
  peek(key: BlobCacheKey): BlobCacheEntry | null
  prefetch(keys: BlobCacheKey[]): void
  retainScope(scope: string): () => void
  clear(): void
}

export function createBlobCache(deps: {
  fetchBlob: (key: BlobCacheKey) => Promise<Blob>
  createObjectURL: (blob: Blob) => string
  revokeObjectURL: (url: string) => void
  schedule: (fn: () => void) => void
}): BlobCache
