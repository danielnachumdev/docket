import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  dueAtIsoForHorizon,
  dueAtIsoForLocalEndOfDay,
  dueSectionForDueAt,
  dueSectionForTask,
  endOfHorizon,
  endOfLocalDay,
  groupTasksByDueSection,
  isOpenDueTodayOrEarlier,
  startOfLocalDay,
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

describe('endOfHorizon', () => {
  // Wednesday 2026-11-18 local
  const wed = new Date(2026, 10, 18, 14, 0, 0, 0)

  it('today / tomorrow are successive local end-of-days', () => {
    assert.equal(endOfHorizon('today', wed).getTime(), endOfLocalDay(wed).getTime())
    const tomorrow = new Date(2026, 10, 19)
    assert.equal(endOfHorizon('tomorrow', wed).getTime(), endOfLocalDay(tomorrow).getTime())
  })

  it('week ends on Saturday (Sunday-start week)', () => {
    const saturday = endOfHorizon('week', wed)
    assert.equal(saturday.getDay(), 6)
    assert.equal(saturday.getDate(), 21)
    assert.equal(saturday.getHours(), 23)
  })

  it('week on Sunday ends the following Saturday', () => {
    const sunday = new Date(2026, 10, 22, 8, 0, 0, 0)
    const end = endOfHorizon('week', sunday)
    assert.equal(end.getDay(), 6)
    assert.equal(end.getDate(), 28)
  })

  it('month ends on last local day of month', () => {
    const end = endOfHorizon('month', wed)
    assert.equal(end.getMonth(), 10)
    assert.equal(end.getDate(), 30)
  })

  it('quarter ends on last day of Q4 for November', () => {
    const end = endOfHorizon('quarter', wed)
    assert.equal(end.getMonth(), 11)
    assert.equal(end.getDate(), 31)
  })

  it('year ends on Dec 31', () => {
    const end = endOfHorizon('year', wed)
    assert.equal(end.getFullYear(), 2026)
    assert.equal(end.getMonth(), 11)
    assert.equal(end.getDate(), 31)
  })

  it('dueAtIsoForHorizon matches endOfHorizon', () => {
    const iso = dueAtIsoForHorizon('week', wed)
    assert.equal(new Date(iso).getTime(), endOfHorizon('week', wed).getTime())
  })
})

describe('dueSectionForDueAt / groupTasksByDueSection', () => {
  // Wednesday noon 2026-11-18
  const now = new Date(2026, 10, 18, 12, 0, 0, 0).getTime()

  it('classifies overdue / today / tomorrow / week / none', () => {
    assert.equal(dueSectionForDueAt(localIso(2026, 11, 17, 18), now), 'overdue')
    assert.equal(dueSectionForDueAt(localIso(2026, 11, 18, 20), now), 'today')
    assert.equal(dueSectionForDueAt(localIso(2026, 11, 19, 9), now), 'tomorrow')
    assert.equal(dueSectionForDueAt(localIso(2026, 11, 21, 12), now), 'week') // Sat
    assert.equal(dueSectionForDueAt(localIso(2026, 11, 22, 12), now), 'month') // next Sun
    assert.equal(dueSectionForDueAt(null, now), 'none')
  })

  it('classifies month / quarter / later (Q4: year end == quarter end)', () => {
    assert.equal(dueSectionForDueAt(localIso(2026, 11, 28, 12), now), 'month')
    assert.equal(dueSectionForDueAt(localIso(2026, 12, 15, 12), now), 'quarter')
    // In Q4, Dec 31 lands in quarter (year bucket empty until next year → later)
    assert.equal(
      dueSectionForDueAt(endOfHorizon('year', new Date(now)).toISOString(), now),
      'quarter',
    )
    assert.equal(dueSectionForDueAt(localIso(2027, 1, 5, 12), now), 'later')
  })

  it('classifies year when due is after this quarter (e.g. March → June)', () => {
    const march = new Date(2026, 2, 10, 12, 0, 0, 0).getTime()
    // In March, month/quarter both end Mar 31 — June is past quarter → year
    assert.equal(dueSectionForDueAt(localIso(2026, 3, 31, 12), march), 'month')
    assert.equal(dueSectionForDueAt(localIso(2026, 6, 1, 12), march), 'year')
  })

  it('prefers due_horizon=year over quarter when ends coincide (Q4)', () => {
    const yearEnd = endOfHorizon('year', new Date(now)).toISOString()
    assert.equal(dueSectionForDueAt(yearEnd, now), 'quarter')
    assert.equal(
      dueSectionForTask({ due_at: yearEnd, due_horizon: 'year' }, now),
      'year',
    )
    assert.equal(
      dueSectionForTask({ due_at: yearEnd, due_horizon: 'quarter' }, now),
      'quarter',
    )
  })

  it('falls back to timestamp when due_horizon is missing or exact', () => {
    const yearEnd = endOfHorizon('year', new Date(now)).toISOString()
    assert.equal(dueSectionForTask({ due_at: yearEnd }, now), 'quarter')
    assert.equal(
      dueSectionForTask({ due_at: yearEnd, due_horizon: null }, now),
      'quarter',
    )
    assert.equal(
      dueSectionForTask({ due_at: yearEnd, due_horizon: 'exact' }, now),
      'quarter',
    )
  })

  it('overdue wins even when due_horizon names a future section', () => {
    assert.equal(
      dueSectionForTask(
        { due_at: localIso(2026, 11, 17, 18), due_horizon: 'year' },
        now,
      ),
      'overdue',
    )
  })

  it('groups in section order and skips empty buckets', () => {
    const tasks = [
      { id: 'a', due_at: localIso(2026, 11, 19, 9) },
      { id: 'b', due_at: null },
      { id: 'c', due_at: localIso(2026, 11, 17, 9) },
      { id: 'd', due_at: localIso(2026, 11, 18, 15) },
    ]
    const sections = groupTasksByDueSection(tasks, now)
    assert.deepEqual(
      sections.map((s) => s.id),
      ['overdue', 'today', 'tomorrow', 'none'],
    )
    assert.deepEqual(
      sections.map((s) => s.tasks.map((t) => t.id)),
      [['c'], ['d'], ['a'], ['b']],
    )
  })

  it('sorts within a section by due_at then created_at (oldest first)', () => {
    const tasks = [
      {
        id: 'late-new',
        due_at: localIso(2026, 11, 25, 18),
        due_horizon: 'week',
        created_at: localIso(2026, 11, 10, 12),
      },
      {
        id: 'early-old',
        due_at: localIso(2026, 11, 22, 9),
        due_horizon: 'week',
        created_at: localIso(2026, 11, 1, 8),
      },
      {
        id: 'early-new',
        due_at: localIso(2026, 11, 22, 9),
        due_horizon: 'week',
        created_at: localIso(2026, 11, 5, 8),
      },
      {
        id: 'none-new',
        due_at: null,
        created_at: localIso(2026, 11, 12, 9),
      },
      {
        id: 'none-old',
        due_at: null,
        created_at: localIso(2026, 11, 2, 9),
      },
    ]
    const sections = groupTasksByDueSection(tasks, now)
    assert.deepEqual(
      sections.map((s) => s.id),
      ['week', 'none'],
    )
    assert.deepEqual(
      sections.map((s) => s.tasks.map((t) => t.id)),
      [
        ['early-old', 'early-new', 'late-new'],
        ['none-old', 'none-new'],
      ],
    )
  })

  it('groups Q4 year-intent under year while quarter-intent stays quarter', () => {
    const yearEnd = endOfHorizon('year', new Date(now)).toISOString()
    const tasks = [
      { id: 'q', due_at: yearEnd, due_horizon: 'quarter', created_at: localIso(2026, 1, 2) },
      { id: 'y', due_at: yearEnd, due_horizon: 'year', created_at: localIso(2026, 1, 1) },
      { id: 'legacy', due_at: yearEnd, due_horizon: null, created_at: localIso(2026, 1, 3) },
    ]
    const sections = groupTasksByDueSection(tasks, now)
    assert.deepEqual(
      sections.map((s) => s.id),
      ['quarter', 'year'],
    )
    assert.deepEqual(
      sections.map((s) => s.tasks.map((t) => t.id)),
      [
        ['q', 'legacy'],
        ['y'],
      ],
    )
  })

  it('startOfLocalDay is midnight local', () => {
    const start = startOfLocalDay(new Date(now))
    assert.equal(start.getHours(), 0)
    assert.equal(start.getMinutes(), 0)
    assert.equal(start.getDate(), 18)
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
