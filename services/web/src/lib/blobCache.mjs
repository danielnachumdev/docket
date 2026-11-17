/** Scope name for pages that show artifacts from many tasks (Artifacts library). */
export const ALL_TASKS_SCOPE = '*'

/**
 * Page-scoped object-URL cache. Each task/artifact blob is fetched at most once
 * while some scope (a mounted page) keeps its task alive.
 *
 * @param {{
 *   fetchBlob: (key: { taskId: string, artifactId: number, title: string, contentType: string | null }) => Promise<Blob>,
 *   createObjectURL: (blob: Blob) => string,
 *   revokeObjectURL: (url: string) => void,
 *   schedule: (fn: () => void) => void,
 * }} deps
 */
export function createBlobCache({ fetchBlob, createObjectURL, revokeObjectURL, schedule }) {
  /** @type {Map<string, { taskId: string, objectUrl: string, blob: Blob, text?: Promise<string> }>} */
  const ready = new Map()
  /** @type {Map<string, { taskId: string, promise: Promise<any> }>} */
  const pending = new Map()
  /** @type {Map<string, number>} */
  const scopes = new Map()

  const idOf = (key) => `${key.taskId}:${key.artifactId}`

  function load(key) {
    const id = idOf(key)
    const hit = ready.get(id)
    if (hit) return Promise.resolve(hit)
    const inflight = pending.get(id)
    if (inflight) return inflight.promise

    const record = { taskId: key.taskId, promise: Promise.resolve() }
    record.promise = fetchBlob(key).then(
      (blob) => {
        const entry = { taskId: key.taskId, blob, objectUrl: createObjectURL(blob) }
        if (pending.get(id) !== record) {
          // Evicted while in flight: hand the bytes to this caller but don't keep them.
          schedule(() => revokeObjectURL(entry.objectUrl))
          return entry
        }
        pending.delete(id)
        ready.set(id, entry)
        return entry
      },
      (err) => {
        if (pending.get(id) === record) pending.delete(id)
        throw err
      },
    )
    pending.set(id, record)
    return record.promise
  }

  function loadText(key) {
    return load(key).then((entry) => {
      entry.text ??= entry.blob.text()
      return entry.text
    })
  }

  function peek(key) {
    return ready.get(idOf(key)) ?? null
  }

  function prefetch(keys) {
    for (const key of keys) {
      load(key).catch(() => {
        /* prefetch is best-effort */
      })
    }
  }

  function evictUnscoped() {
    if (scopes.has(ALL_TASKS_SCOPE)) return
    for (const [id, entry] of ready) {
      if (scopes.has(entry.taskId)) continue
      revokeObjectURL(entry.objectUrl)
      ready.delete(id)
    }
    for (const [id, entry] of pending) {
      if (!scopes.has(entry.taskId)) pending.delete(id)
    }
  }

  /**
   * Keep a task's blobs alive while a page is mounted. Release is deferred so a
   * StrictMode remount (or a quick re-render) does not discard warm entries.
   */
  function retainScope(scope) {
    scopes.set(scope, (scopes.get(scope) ?? 0) + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      const next = (scopes.get(scope) ?? 1) - 1
      if (next > 0) scopes.set(scope, next)
      else scopes.delete(scope)
      schedule(evictUnscoped)
    }
  }

  function clear() {
    for (const entry of ready.values()) revokeObjectURL(entry.objectUrl)
    ready.clear()
    pending.clear()
  }

  return { load, loadText, peek, prefetch, retainScope, clear }
}
