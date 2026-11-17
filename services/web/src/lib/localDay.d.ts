/** Local calendar-day helpers (timezone-aware via the runtime's local offset). */

export const HORIZON_IDS: readonly [
  'today',
  'tomorrow',
  'week',
  'month',
  'quarter',
  'year',
]

export const DUE_SECTION_IDS: readonly [
  'overdue',
  'today',
  'tomorrow',
  'week',
  'month',
  'quarter',
  'year',
  'later',
  'none',
]

export type HorizonId = (typeof HORIZON_IDS)[number]
export type DueSectionId = (typeof DUE_SECTION_IDS)[number]

export function parseDueAt(value: string | null | undefined): Date | null

/** Start of the local calendar day for `ref` (00:00:00.000 local). */
export function startOfLocalDay(ref?: Date): Date

/** End of the local calendar day for `ref` (23:59:59.999 local). */
export function endOfLocalDay(ref?: Date): Date

/** End of a named due horizon in the viewer's local timezone. */
export function endOfHorizon(horizon: HorizonId, ref?: Date): Date

/** ISO datetime for local end-of-day (suitable for PATCH `due_at`). */
export function dueAtIsoForLocalEndOfDay(ref?: Date): string

/** ISO datetime for the end of a named horizon (suitable for PATCH `due_at`). */
export function dueAtIsoForHorizon(horizon: HorizonId, ref?: Date): string

/**
 * Open task with a parseable `due_at` on or before local end of today
 * (includes overdue). Closed tasks never match.
 */
export function isOpenDueTodayOrEarlier(
  status: string,
  dueAt: string | null | undefined,
  nowMs?: number,
): boolean

/** Mutually exclusive date-mode section for a `due_at` value. */
export function dueSectionForDueAt(
  dueAt: string | null | undefined,
  nowMs?: number,
): DueSectionId

/** Date-mode section preferring stored `due_horizon` when present. */
export function dueSectionForTask(
  task: { due_at?: string | null; due_horizon?: string | null },
  nowMs?: number,
): DueSectionId

/** Group tasks into date-mode sections (non-empty only). */
export function groupTasksByDueSection<
  T extends { due_at?: string | null; due_horizon?: string | null },
>(tasks: T[], nowMs?: number): { id: DueSectionId; tasks: T[] }[]
