import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { chartTotal, wipAgeBuckets } from './progressCharts.mjs'

describe('chartTotal', () => {
  it('sums non-negative values', () => {
    assert.equal(
      chartTotal([
        { key: 'a', label: 'A', value: 2, color: 'x' },
        { key: 'b', label: 'B', value: 3, color: 'y' },
      ]),
      5,
    )
  })

  it('clamps negatives to zero', () => {
    assert.equal(chartTotal([{ key: 'a', label: 'A', value: -4, color: 'x' }]), 0)
  })
})

describe('wipAgeBuckets', () => {
  it('splits cumulative older_than counts into exclusive buckets', () => {
    assert.deepEqual(
      wipAgeBuckets({ open: 10, open_older_than_7d: 6, open_older_than_30d: 2 }),
      { fresh: 4, mid: 4, old: 2 },
    )
  })
})
