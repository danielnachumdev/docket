/** Local calendar-day helpers (timezone-aware via the runtime's local offset). */

const NAIVE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/

function parseDueAt(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(NAIVE_ISO.test(value) ? `${value}Z` : value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** End of the local calendar day for `ref` (23:59:59.999 local). */
export function endOfLocalDay(ref: Date = new Date()): Date {
  return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999)
}

/** ISO datetime for local end-of-day (suitable for PATCH `due_at`). */
export function dueAtIsoForLocalEndOfDay(ref: Date = new Date()): string {
  return endOfLocalDay(ref).toISOString()
}

/**
 * Open task with a parseable `due_at` on or before local end of today
 * (includes overdue). Closed tasks never match.
 */
export function isOpenDueTodayOrEarlier(
  status: string,
  dueAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (status === 'done' || status === 'cancelled') return false
  const due = parseDueAt(dueAt)
  if (!due) return false
  return due.getTime() <= endOfLocalDay(new Date(nowMs)).getTime()
}
