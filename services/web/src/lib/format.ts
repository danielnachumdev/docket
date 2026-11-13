export const STATUSES = [
  'open',
  'in_progress',
  'blocked',
  'on_hold',
  'done',
  'cancelled',
] as const
export type Status = (typeof STATUSES)[number]

export const PRIORITIES = [1, 2, 3, 4] as const

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  on_hold: 'On hold',
  done: 'Done',
  cancelled: 'Cancelled',
}

const PRIORITY_LABELS: Record<number, string> = {
  1: 'Urgent',
  2: 'High',
  3: 'Normal',
  4: 'Low',
}

export function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? humanize(status)
}

export function priorityLabel(priority: number) {
  return PRIORITY_LABELS[priority] ?? `P${priority}`
}

export function isClosed(status: string) {
  return status === 'done' || status === 'cancelled'
}

export function humanize(value: string) {
  const text = value.replace(/[_.]+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const NAIVE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/

export function parseDate(value: string | null | undefined) {
  if (!value) return null
  // The API serializes UTC timestamps without an offset.
  const d = new Date(NAIVE_ISO.test(value) ? `${value}Z` : value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDateTime(value: string | null | undefined) {
  const d = parseDate(value)
  if (!d) return '—'
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

export function formatRelative(value: string | null | undefined, now = Date.now()) {
  const d = parseDate(value)
  if (!d) return '—'
  const seconds = Math.round((d.getTime() - now) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return relative.format(Math.round(seconds / size), unit)
    }
  }
  return 'just now'
}

export type DueState = 'overdue' | 'soon' | 'later'

export function dueState(due: string | null, now = Date.now()): DueState | null {
  const d = parseDate(due)
  if (!d) return null
  const diff = d.getTime() - now
  if (diff < 0) return 'overdue'
  if (diff < 48 * 3600 * 1000) return 'soon'
  return 'later'
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : name.slice(0, 2)
  return letters.toUpperCase()
}

export function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}
