/** Local calendar-day helpers (timezone-aware via the runtime's local offset). */

/** End of the local calendar day for `ref` (23:59:59.999 local). */
export function endOfLocalDay(ref?: Date): Date

/** ISO datetime for local end-of-day (suitable for PATCH `due_at`). */
export function dueAtIsoForLocalEndOfDay(ref?: Date): string

/**
 * Open task with a parseable `due_at` on or before local end of today
 * (includes overdue). Closed tasks never match.
 */
export function isOpenDueTodayOrEarlier(
  status: string,
  dueAt: string | null | undefined,
  nowMs?: number,
): boolean
