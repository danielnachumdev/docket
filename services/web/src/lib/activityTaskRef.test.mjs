import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatActivityTaskChipLabel, linkEventTaskIds } from './activityTaskRef.mjs'

describe('formatActivityTaskChipLabel', () => {
  it('prefers viewer number plus title', () => {
    assert.equal(
      formatActivityTaskChipLabel({
        number: 12,
        title: 'Wire activity chips',
        publicId: 'tqT3dNAzlVjG',
      }),
      '#12 Wire activity chips',
    )
  })

  it('falls back to number only when showTitle is false', () => {
    assert.equal(
      formatActivityTaskChipLabel({
        number: 12,
        title: 'Wire activity chips',
        showTitle: false,
      }),
      '#12',
    )
  })

  it('falls back to public id while unresolved', () => {
    assert.equal(
      formatActivityTaskChipLabel({ publicId: 'QQ8o6uccNs1h' }),
      '#QQ8o6uccNs1h',
    )
  })

  it('uses em dash when nothing is available', () => {
    assert.equal(formatActivityTaskChipLabel({}), '#—')
  })
})

describe('linkEventTaskIds', () => {
  it('reads public ids and kind from link payloads', () => {
    assert.deepEqual(
      linkEventTaskIds({
        from_task_id: 'aaa',
        to_task_id: 'bbb',
        kind: 'blocks',
      }),
      { from: 'aaa', to: 'bbb', kind: 'blocks' },
    )
  })

  it('returns nulls for missing payload fields', () => {
    assert.deepEqual(linkEventTaskIds(null), { from: null, to: null, kind: null })
    assert.deepEqual(linkEventTaskIds({}), { from: null, to: null, kind: null })
  })
})
