import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ALL_TASKS_SCOPE, createBlobCache } from './blobCache.mjs'

function harness() {
  const fetched = []
  const revoked = []
  const queue = []
  let n = 0
  const cache = createBlobCache({
    fetchBlob: async (key) => {
      fetched.push(`${key.taskId}:${key.artifactId}`)
      return new Blob([`body-${key.artifactId}`], { type: 'text/plain' })
    },
    createObjectURL: () => `blob:${++n}`,
    revokeObjectURL: (url) => revoked.push(url),
    schedule: (fn) => queue.push(fn),
  })
  const flush = () => {
    while (queue.length) queue.shift()()
  }
  return { cache, fetched, revoked, flush }
}

const key = (taskId, artifactId) => ({ taskId, artifactId, title: `a${artifactId}`, contentType: null })

describe('blob cache', () => {
  it('fetches each artifact once across prefetch, concurrent loads, and text reads', async () => {
    const { cache, fetched } = harness()
    const release = cache.retainScope('t1')
    cache.prefetch([key('t1', 1), key('t1', 2)])
    const [a, b] = await Promise.all([cache.load(key('t1', 1)), cache.load(key('t1', 1))])
    assert.equal(a.objectUrl, b.objectUrl)
    assert.equal(await cache.loadText(key('t1', 2)), 'body-2')
    assert.equal(await cache.loadText(key('t1', 2)), 'body-2')
    assert.deepEqual(fetched, ['t1:1', 't1:2'])
    assert.ok(cache.peek(key('t1', 1)))
    release()
  })

  it('survives a StrictMode-style release + immediate re-retain', async () => {
    const { cache, fetched, revoked, flush } = harness()
    cache.retainScope('t1')()
    const release = cache.retainScope('t1')
    await cache.load(key('t1', 1))
    flush()
    await cache.load(key('t1', 1))
    assert.deepEqual(fetched, ['t1:1'])
    assert.deepEqual(revoked, [])
    release()
  })

  it('revokes a task once its page scope is gone, keeping other live tasks', async () => {
    const { cache, revoked, flush } = harness()
    const r1 = cache.retainScope('t1')
    const r2 = cache.retainScope('t2')
    const e1 = await cache.load(key('t1', 1))
    const e2 = await cache.load(key('t2', 1))
    r1()
    flush()
    assert.deepEqual(revoked, [e1.objectUrl])
    assert.equal(cache.peek(key('t1', 1)), null)
    assert.ok(cache.peek(key('t2', 1)))
    assert.notEqual(e2.objectUrl, e1.objectUrl)
    r2()
  })

  it('does not keep a blob that finishes after its scope was evicted', async () => {
    const { cache, revoked, flush } = harness()
    const release = cache.retainScope('t1')
    const inflight = cache.load(key('t1', 1))
    release()
    flush()
    const entry = await inflight
    flush()
    assert.equal(cache.peek(key('t1', 1)), null)
    assert.deepEqual(revoked, [entry.objectUrl])
  })

  it('library scope keeps every task warm', async () => {
    const { cache, revoked, flush } = harness()
    const lib = cache.retainScope(ALL_TASKS_SCOPE)
    const other = cache.retainScope('t9')
    await cache.load(key('t1', 1))
    other()
    flush()
    assert.deepEqual(revoked, [])
    lib()
    flush()
    assert.equal(revoked.length, 1)
  })
})
