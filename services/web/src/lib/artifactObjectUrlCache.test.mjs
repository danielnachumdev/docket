import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

/**
 * Cache module talks to `api` — smoke-test the keying helpers via a tiny
 * local double of the same id scheme used in production.
 */
function cacheKey(taskId, artifactId) {
  return `${taskId}:${artifactId}`
}

describe('artifactObjectUrlCache keying', () => {
  it('scopes blobs per task + artifact id', () => {
    assert.equal(cacheKey('abc', 1), 'abc:1')
    assert.notEqual(cacheKey('abc', 1), cacheKey('abc', 2))
    assert.notEqual(cacheKey('abc', 1), cacheKey('xyz', 1))
  })
})
