import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { placeAnchoredFloating } from './placeAnchoredFloating.mjs'

const viewport = { width: 1000, height: 800 }

describe('placeAnchoredFloating', () => {
  it('defaults to below when there is room', () => {
    const pos = placeAnchoredFloating(
      { top: 100, right: 200, bottom: 132, left: 160 },
      { width: 208, height: 240 },
      viewport,
    )
    assert.equal(pos.placement, 'below')
    assert.equal(pos.top, 138)
    assert.equal(pos.left, 160)
  })

  it('flips above when below would clip and above fits', () => {
    const pos = placeAnchoredFloating(
      { top: 700, right: 200, bottom: 732, left: 160 },
      { width: 208, height: 240 },
      viewport,
    )
    assert.equal(pos.placement, 'above')
    assert.equal(pos.top, 700 - 6 - 240)
  })

  it('stays below when neither side fully fits but below is the default fallback', () => {
    const pos = placeAnchoredFloating(
      { top: 20, right: 200, bottom: 52, left: 160 },
      { width: 208, height: 900 },
      viewport,
      { edgePx: 8 },
    )
    assert.equal(pos.placement, 'below')
  })

  it('aligns end to the anchor inline-end in LTR', () => {
    const pos = placeAnchoredFloating(
      { top: 100, right: 400, bottom: 132, left: 360 },
      { width: 208, height: 100 },
      viewport,
      { align: 'end', rtl: false },
    )
    assert.equal(pos.left, 400 - 208)
  })

  it('aligns end to the anchor inline-end in RTL', () => {
    const pos = placeAnchoredFloating(
      { top: 100, right: 400, bottom: 132, left: 360 },
      { width: 208, height: 100 },
      viewport,
      { align: 'end', rtl: true },
    )
    assert.equal(pos.left, 360)
  })

  it('clamps horizontally into the viewport', () => {
    const pos = placeAnchoredFloating(
      { top: 100, right: 990, bottom: 132, left: 950 },
      { width: 208, height: 100 },
      viewport,
      { align: 'start', edgePx: 8 },
    )
    assert.equal(pos.left, 1000 - 208 - 8)
  })
})
