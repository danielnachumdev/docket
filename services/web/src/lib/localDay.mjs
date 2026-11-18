/** Local calendar-day helpers (timezone-aware via the runtime's local offset). */

const NAIVE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/

/** Horizon chips that write `due_at` (excludes Exact / Clear). */
export const HORIZON_IDS = Object.freeze([
  'today',
  'tomorrow',
  'week',
  'month',
  'quarter',
  'year',
])

/** Date-mode section order (mutually exclusive buckets). */
export const DUE_SECTION_IDS = Object.freeze([
  'overdue',
  'today',
  'tomorrow',
  'week',
  'month',
  'quarter',
  'year',
  'later',
  'none',
])

/**
 * @param {string | null | undefined} value
 * @returns {Date | null}
 */
export function parseDueAt(value) {
  if (!value) return null
  const d = new Date(NAIVE_ISO.test(value) ? `${value}Z` : value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Start of the local calendar day for `ref` (00:00:00.000 local). */
export function startOfLocalDay(ref = new Date()) {
  return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0)
}

/** End of the local calendar day for `ref` (23:59:59.999 local). */
export function endOfLocalDay(ref = new Date()) {
  return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999)
}

/**
 * End of a named due horizon in the viewer's local timezone.
 * Week is Sunday-start (ends Saturday). Quarter ends on the last day of Mar/Jun/Sep/Dec.
 * @param {'today' | 'tomorrow' | 'week' | 'month' | 'quarter' | 'year'} horizon
 * @param {Date} [ref]
 */
export function endOfHorizon(horizon, ref = new Date()) {
  switch (horizon) {
    case 'today':
      return endOfLocalDay(ref)
    case 'tomorrow': {
      const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1)
      return endOfLocalDay(d)
    }
    case 'week': {
      const day = ref.getDay() // 0=Sun … 6=Sat; Sunday-start → Saturday end
      const daysUntilSaturday = 6 - day
      const d = new Date(
        ref.getFullYear(),
        ref.getMonth(),
        ref.getDate() + daysUntilSaturday,
      )
      return endOfLocalDay(d)
    }
    case 'month': {
      const d = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
      return endOfLocalDay(d)
    }
    case 'quarter': {
      const quarter = Math.floor(ref.getMonth() / 3)
      const endMonth = quarter * 3 + 2
      const d = new Date(ref.getFullYear(), endMonth + 1, 0)
      return endOfLocalDay(d)
    }
    case 'year': {
      const d = new Date(ref.getFullYear(), 11, 31)
      return endOfLocalDay(d)
    }
    default:
      throw new Error(`unknown horizon: ${horizon}`)
  }
}

/** ISO datetime for local end-of-day (suitable for PATCH `due_at`). */
export function dueAtIsoForLocalEndOfDay(ref = new Date()) {
  return endOfLocalDay(ref).toISOString()
}

/** ISO datetime for the end of a named horizon (suitable for PATCH `due_at`). */
export function dueAtIsoForHorizon(horizon, ref = new Date()) {
  return endOfHorizon(horizon, ref).toISOString()
}

/**
 * Open task with a parseable `due_at` on or before local end of today
 * (includes overdue). Closed tasks never match.
 * @param {string} status
 * @param {string | null | undefined} dueAt
 * @param {number} [nowMs]
 */
export function isOpenDueTodayOrEarlier(status, dueAt, nowMs = Date.now()) {
  if (status === 'done' || status === 'cancelled') return false
  const due = parseDueAt(dueAt)
  if (!due) return false
  return due.getTime() <= endOfLocalDay(new Date(nowMs)).getTime()
}

/**
 * Mutually exclusive date-mode section for a `due_at` value (timestamp first-match).
 * @param {string | null | undefined} dueAt
 * @param {number} [nowMs]
 * @returns {(typeof DUE_SECTION_IDS)[number]}
 */
export function dueSectionForDueAt(dueAt, nowMs = Date.now()) {
  const due = parseDueAt(dueAt)
  if (!due) return 'none'
  const now = new Date(nowMs)
  const t = due.getTime()
  if (t < startOfLocalDay(now).getTime()) return 'overdue'
  if (t <= endOfHorizon('today', now).getTime()) return 'today'
  if (t <= endOfHorizon('tomorrow', now).getTime()) return 'tomorrow'
  if (t <= endOfHorizon('week', now).getTime()) return 'week'
  if (t <= endOfHorizon('month', now).getTime()) return 'month'
  if (t <= endOfHorizon('quarter', now).getTime()) return 'quarter'
  if (t <= endOfHorizon('year', now).getTime()) return 'year'
  return 'later'
}

/**
 * Date-mode section preferring stored `due_horizon` intent when present.
 * Overdue always wins; named horizons map to their section; `exact` / missing
 * fall back to timestamp first-match (legacy rows).
 * @param {{ due_at?: string | null, due_horizon?: string | null }} task
 * @param {number} [nowMs]
 * @returns {(typeof DUE_SECTION_IDS)[number]}
 */
export function dueSectionForTask(task, nowMs = Date.now()) {
  const due = parseDueAt(task?.due_at)
  if (!due) return 'none'
  const now = new Date(nowMs)
  if (due.getTime() < startOfLocalDay(now).getTime()) return 'overdue'
  const horizon = task?.due_horizon
  if (horizon && HORIZON_IDS.includes(horizon)) return horizon
  return dueSectionForDueAt(task.due_at, nowMs)
}

/**
 * Within a date-mode section: earlier `due_at` first, then older `created_at`
 * (addition order). Missing timestamps sort last; `id` breaks remaining ties.
 * @param {{ due_at?: string | null, created_at?: string | null, id?: string | number }} a
 * @param {{ due_at?: string | null, created_at?: string | null, id?: string | number }} b
 */
function compareWithinDueSection(a, b) {
  const dueA = parseDueAt(a?.due_at)?.getTime() ?? Number.POSITIVE_INFINITY
  const dueB = parseDueAt(b?.due_at)?.getTime() ?? Number.POSITIVE_INFINITY
  if (dueA !== dueB) return dueA - dueB

  const createdA = parseDueAt(a?.created_at)?.getTime() ?? Number.POSITIVE_INFINITY
  const createdB = parseDueAt(b?.created_at)?.getTime() ?? Number.POSITIVE_INFINITY
  if (createdA !== createdB) return createdA - createdB

  const idA = a?.id
  const idB = b?.id
  if (idA == null && idB == null) return 0
  if (idA == null) return 1
  if (idB == null) return -1
  if (typeof idA === 'number' && typeof idB === 'number') return idA - idB
  return String(idA).localeCompare(String(idB))
}

/**
 * Group tasks into date-mode sections (non-empty only). Within each section,
 * sort by due date ascending, then creation time ascending (oldest first).
 * @template {{ due_at?: string | null, due_horizon?: string | null, created_at?: string | null, id?: string | number }} T
 * @param {T[]} tasks
 * @param {number} [nowMs]
 * @returns {{ id: (typeof DUE_SECTION_IDS)[number], tasks: T[] }[]}
 */
export function groupTasksByDueSection(tasks, nowMs = Date.now()) {
  /** @type {Map<string, typeof tasks>} */
  const buckets = new Map(DUE_SECTION_IDS.map((id) => [id, []]))
  for (const task of tasks) {
    const id = dueSectionForTask(task, nowMs)
    buckets.get(id).push(task)
  }
  return DUE_SECTION_IDS.map((id) => ({
    id,
    tasks: buckets.get(id).slice().sort(compareWithinDueSection),
  })).filter((section) => section.tasks.length > 0)
}
