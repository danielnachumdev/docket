import type { Task } from '../api'
import i18n from '../i18n'
import { isClosed, parseDate, statusLabel, type Status } from './format'

export const SMART_FILTERS = [
  'my_open',
  'due_soon',
  'on_hold_stale',
  'claimed',
  'unread',
  'read',
] as const

export type SmartFilter = (typeof SMART_FILTERS)[number]

export type StatusFilter = 'active' | 'all' | Status

export type FilterKey = StatusFilter | SmartFilter

const DAY_MS = 24 * 3600 * 1000
export const DUE_SOON_DAYS = 7
export const ON_HOLD_STALE_DAYS = 7

export function filterLabel(key: FilterKey): string {
  const domainKey = `filter.${key}`
  if (i18n.exists(domainKey, { ns: 'domain' })) {
    return i18n.t(domainKey, { ns: 'domain' })
  }
  return statusLabel(key)
}

export function isSmartFilter(key: string): key is SmartFilter {
  return (SMART_FILTERS as readonly string[]).includes(key)
}

export function isClaimActive(task: Task, now = Date.now()): boolean {
  if (task.claimed_by_token_id == null) return false
  if (!task.claim_expires_at) return true
  const expires = parseDate(task.claim_expires_at)
  return expires != null && expires.getTime() > now
}

export function matchesSmartFilter(
  task: Task,
  key: SmartFilter,
  opts: { userId: number | null; now?: number },
): boolean {
  const now = opts.now ?? Date.now()
  switch (key) {
    case 'my_open':
      return (
        opts.userId != null &&
        task.owner_user_id === opts.userId &&
        !isClosed(task.status)
      )
    case 'due_soon': {
      if (isClosed(task.status) || !task.due_at) return false
      const due = parseDate(task.due_at)
      if (!due) return false
      return due.getTime() <= now + DUE_SOON_DAYS * DAY_MS
    }
    case 'on_hold_stale': {
      if (task.status !== 'on_hold') return false
      const updated = parseDate(task.updated_at)
      if (!updated) return false
      return now - updated.getTime() >= ON_HOLD_STALE_DAYS * DAY_MS
    }
    case 'claimed':
      return isClaimActive(task, now)
    case 'unread':
      return Boolean(task.unread)
    case 'read':
      return !task.unread
    default:
      return false
  }
}

export function matchesFilterKey(
  task: Task,
  key: FilterKey,
  opts: { userId: number | null; query: string; pinned: Set<string>; now?: number },
): boolean {
  if (opts.query && !task.title.toLowerCase().includes(opts.query)) return false
  if (opts.pinned.has(task.id)) return true
  if (isSmartFilter(key)) return matchesSmartFilter(task, key, opts)
  if (key === 'all') return true
  if (key === 'active') return !isClosed(task.status)
  return task.status === key
}
