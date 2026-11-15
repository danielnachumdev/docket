import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  dueAtIsoForLocalEndOfDay,
  endOfLocalDay,
  isOpenDueTodayOrEarlier,
} from './localDay.mjs'

function localIso(y, m, d, h = 12, min = 0) {
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString()
}

describe('endOfLocalDay', () => {
  it('lands on 23:59:59.999 of the same local calendar day', () => {
    const ref = new Date(2026, 10, 15, 9, 30, 0, 0)
    const eod = endOfLocalDay(ref)
    assert.equal(eod.getFullYear(), 2026)
    assert.equal(eod.getMonth(), 10)
    assert.equal(eod.getDate(), 15)
    assert.equal(eod.getHours(), 23)
    assert.equal(eod.getMinutes(), 59)
    assert.equal(eod.getSeconds(), 59)
    assert.equal(eod.getMilliseconds(), 999)
  })

  it('dueAtIsoForLocalEndOfDay is timezone-aware ISO', () => {
    const ref = new Date(2026, 10, 15, 9, 0, 0, 0)
    const iso = dueAtIsoForLocalEndOfDay(ref)
    assert.match(iso, /Z$/)
    assert.equal(new Date(iso).getTime(), endOfLocalDay(ref).getTime())
  })
})

describe('isOpenDueTodayOrEarlier (today smart filter)', () => {
  const noon = new Date(2026, 10, 15, 12, 0, 0, 0).getTime()

  it('matches overdue open tasks', () => {
    const due = localIso(2026, 11, 14, 18, 0)
    assert.equal(isOpenDueTodayOrEarlier('backlog', due, noon), true)
    assert.equal(isOpenDueTodayOrEarlier('in_progress', due, noon), true)
  })

  it('matches due later today', () => {
    const due = localIso(2026, 11, 15, 20, 0)
    assert.equal(isOpenDueTodayOrEarlier('backlog', due, noon), true)
  })

  it('matches due at end of local today', () => {
    const due = endOfLocalDay(new Date(noon)).toISOString()
    assert.equal(isOpenDueTodayOrEarlier('backlog', due, noon), true)
  })

  it('does not match tomorrow', () => {
    const due = localIso(2026, 11, 16, 9, 0)
    assert.equal(isOpenDueTodayOrEarlier('backlog', due, noon), false)
  })

  it('does not match closed tasks even if due today', () => {
    const due = localIso(2026, 11, 15, 10, 0)
    assert.equal(isOpenDueTodayOrEarlier('done', due, noon), false)
    assert.equal(isOpenDueTodayOrEarlier('cancelled', due, noon), false)
  })

  it('does not match missing or unparseable due_at', () => {
    assert.equal(isOpenDueTodayOrEarlier('backlog', null, noon), false)
    assert.equal(isOpenDueTodayOrEarlier('backlog', 'not-a-date', noon), false)
  })
})
