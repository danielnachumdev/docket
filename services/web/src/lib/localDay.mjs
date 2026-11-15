/** Local calendar-day helpers (timezone-aware via the runtime's local offset). */

const NAIVE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/

/**
 * @param {string | null | undefined} value
 * @returns {Date | null}
 */
function parseDueAt(value) {
  if (!value) return null
  const d = new Date(NAIVE_ISO.test(value) ? `${value}Z` : value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** End of the local calendar day for `ref` (23:59:59.999 local). */
export function endOfLocalDay(ref = new Date()) {
  return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999)
}

/** ISO datetime for local end-of-day (suitable for PATCH `due_at`). */
export function dueAtIsoForLocalEndOfDay(ref = new Date()) {
  return endOfLocalDay(ref).toISOString()
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
