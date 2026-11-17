import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { mapPool } from './mapPool.mjs'

describe('mapPool', () => {
  it('preserves order with limited concurrency', async () => {
    let inFlight = 0
    let peak = 0
    const items = [1, 2, 3, 4, 5, 6]
    const out = await mapPool(items, 2, async (n) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return n * 10
    })
    assert.deepEqual(out, [10, 20, 30, 40, 50, 60])
    assert.ok(peak <= 2)
  })
})
