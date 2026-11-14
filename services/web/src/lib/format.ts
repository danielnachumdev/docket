import i18n from '../i18n'

export const STATUSES = [
  'backlog',
  'in_progress',
  'blocked',
  'on_hold',
  'failed',
  'done',
  'cancelled',
] as const
export type Status = (typeof STATUSES)[number]

export const PRIORITIES = [1, 2, 3, 4] as const

export function statusLabel(status: string) {
  const key = `status.${status}`
  if (i18n.exists(key, { ns: 'domain' })) {
    return i18n.t(key, { ns: 'domain' })
  }
  return humanize(status)
}

export function priorityLabel(priority: number) {
  const key = `priority.${priority}`
  if (i18n.exists(key, { ns: 'domain' })) {
    return i18n.t(key, { ns: 'domain' })
  }
  return i18n.t('priority.fallback', { ns: 'domain', priority })
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
  if (!d) return i18n.t('emDash', { ns: 'common' })
  return d.toLocaleString(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function relativeFormatter() {
  return new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' })
}

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
  if (!d) return i18n.t('emDash', { ns: 'common' })
  const seconds = Math.round((d.getTime() - now) / 1000)
  const relative = relativeFormatter()
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return relative.format(Math.round(seconds / size), unit)
    }
  }
  return i18n.t('relative.justNow', { ns: 'domain' })
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return i18n.t('bytes.zero', { ns: 'common' })
  }
  const units = ['B', 'KB', 'MB', 'GB'] as const
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unit]}`
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
