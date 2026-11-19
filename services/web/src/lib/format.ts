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

/** Pause-like statuses that accept an optional status reason. */
export const PAUSE_STATUSES = ['blocked', 'on_hold'] as const
export type PauseStatus = (typeof PAUSE_STATUSES)[number]

export function isPauseStatus(status: string): status is PauseStatus {
  return (PAUSE_STATUSES as readonly string[]).includes(status)
}

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

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
export type TimeFormat = '24h' | '12h'

export const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const
export const TIME_FORMATS = ['24h', '12h'] as const

export const DEFAULT_DATE_FORMAT: DateFormat = 'DD/MM/YYYY'
export const DEFAULT_TIME_FORMAT: TimeFormat = '24h'

let activeDateFormat: DateFormat = DEFAULT_DATE_FORMAT
let activeTimeFormat: TimeFormat = DEFAULT_TIME_FORMAT

export function configureDateTimeFormat(dateFormat: DateFormat, timeFormat: TimeFormat) {
  activeDateFormat = dateFormat
  activeTimeFormat = timeFormat
}

export function getDateTimeFormat() {
  return { dateFormat: activeDateFormat, timeFormat: activeTimeFormat }
}

export function isDateFormat(value: string): value is DateFormat {
  return (DATE_FORMATS as readonly string[]).includes(value)
}

export function isTimeFormat(value: string): value is TimeFormat {
  return (TIME_FORMATS as readonly string[]).includes(value)
}

export function parseDate(value: string | null | undefined) {
  if (!value) return null
  // The API serializes UTC timestamps without an offset.
  const d = new Date(NAIVE_ISO.test(value) ? `${value}Z` : value)
  return Number.isNaN(d.getTime()) ? null : d
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function formatDatePart(d: Date, format: DateFormat) {
  const day = pad2(d.getDate())
  const month = pad2(d.getMonth() + 1)
  const year = String(d.getFullYear())
  if (format === 'MM/DD/YYYY') return `${month}/${day}/${year}`
  if (format === 'YYYY-MM-DD') return `${year}-${month}-${day}`
  return `${day}/${month}/${year}`
}

function formatTimePart(d: Date, format: TimeFormat) {
  if (format === '12h') {
    return d.toLocaleTimeString(i18n.language, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export type DateTimeFormatOptions = {
  dateFormat?: DateFormat
  timeFormat?: TimeFormat
}

function resolveFormats(options?: DateTimeFormatOptions) {
  return {
    dateFormat: options?.dateFormat ?? activeDateFormat,
    timeFormat: options?.timeFormat ?? activeTimeFormat,
  }
}

/** Format a local `Date` with the active (or override) date/time prefs. */
export function formatDateTimeFromDate(d: Date, options?: DateTimeFormatOptions) {
  const { dateFormat, timeFormat } = resolveFormats(options)
  return `${formatDatePart(d, dateFormat)} ${formatTimePart(d, timeFormat)}`
}

export function formatDateTime(
  value: string | null | undefined,
  options?: DateTimeFormatOptions,
) {
  const d = parseDate(value)
  if (!d) return i18n.t('emDash', { ns: 'common' })
  return formatDateTimeFromDate(d, options)
}

/** `YYYY-MM-DDTHH:mm` in local time (native datetime-local wire format). */
export function toLocalInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function dateFromLocalInput(value: string) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatLocalInputValue(value: string, options?: DateTimeFormatOptions) {
  const d = dateFromLocalInput(value)
  if (!d) return ''
  return formatDateTimeFromDate(d, options)
}

export function datetimeInputPlaceholder(options?: DateTimeFormatOptions) {
  const { dateFormat, timeFormat } = resolveFormats(options)
  const time = timeFormat === '12h' ? '2:30 PM' : '14:30'
  if (dateFormat === 'MM/DD/YYYY') return `11/19/2026 ${time}`
  if (dateFormat === 'YYYY-MM-DD') return `2026-11-19 ${time}`
  return `19/11/2026 ${time}`
}

function parseDateParts(
  datePart: string,
  dateFormat: DateFormat,
): { year: number; month: number; day: number } | null {
  if (dateFormat === 'YYYY-MM-DD') {
    const m = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (!m) return null
    return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
  }
  const m = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[2])
  const year = Number(m[3])
  if (dateFormat === 'MM/DD/YYYY') return { year, month: a, day: b }
  return { year, month: b, day: a }
}

function parseTimeParts(
  timePart: string,
  timeFormat: TimeFormat,
): { hours: number; minutes: number } | null {
  const trimmed = timePart.trim()
  const h24 = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (h24) {
    const hours = Number(h24[1])
    const minutes = Number(h24[2])
    if (hours > 23 || minutes > 59) return null
    return { hours, minutes }
  }
  if (timeFormat !== '12h') return null
  const h12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/)
  if (!h12) return null
  let hours = Number(h12[1])
  const minutes = Number(h12[2])
  if (hours < 1 || hours > 12 || minutes > 59) return null
  const ampm = h12[3]!.toUpperCase()
  if (ampm === 'AM') {
    if (hours === 12) hours = 0
  } else if (hours !== 12) {
    hours += 12
  }
  return { hours, minutes }
}

/** Parse a preference-shaped datetime string into a local `Date`. */
export function parseDateTimeInput(
  text: string,
  options?: DateTimeFormatOptions,
): Date | null {
  const cleaned = text.trim().replace(/\s+/g, ' ')
  if (!cleaned) return null
  const { dateFormat, timeFormat } = resolveFormats(options)
  const match = cleaned.match(/^(.+?)\s+(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)$/)
  if (!match) return null
  const parts = parseDateParts(match[1]!, dateFormat)
  const time = parseTimeParts(match[2]!, timeFormat)
  if (!parts || !time) return null
  const d = new Date(parts.year, parts.month - 1, parts.day, time.hours, time.minutes, 0, 0)
  if (
    d.getFullYear() !== parts.year ||
    d.getMonth() !== parts.month - 1 ||
    d.getDate() !== parts.day
  ) {
    return null
  }
  return d
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
