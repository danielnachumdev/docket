/**
 * Display label for a task ref chip in activity (and optionally comments).
 * Prefer per-viewer number + title; fall back sensibly while loading / missing.
 *
 * @param {{ number?: number | null, title?: string | null, publicId?: string | null, showTitle?: boolean }} opts
 */
export function formatActivityTaskChipLabel({
  number = null,
  title = null,
  publicId = null,
  showTitle = true,
} = {}) {
  const num =
    typeof number === 'number' && Number.isFinite(number) ? `#${number}` : null
  const trimmedTitle = typeof title === 'string' && title.trim() ? title.trim() : null
  if (num && showTitle && trimmedTitle) return `${num} ${trimmedTitle}`
  if (num) return num
  if (showTitle && trimmedTitle) return trimmedTitle
  if (typeof publicId === 'string' && publicId) return `#${publicId}`
  return '#—'
}

/**
 * @param {Record<string, unknown> | null | undefined} payload
 * @returns {{ from: string | null, to: string | null, kind: string | null }}
 */
export function linkEventTaskIds(payload) {
  if (!payload || typeof payload !== 'object') {
    return { from: null, to: null, kind: null }
  }
  const from =
    typeof payload.from_task_id === 'string' && payload.from_task_id
      ? payload.from_task_id
      : null
  const to =
    typeof payload.to_task_id === 'string' && payload.to_task_id
      ? payload.to_task_id
      : null
  const kind =
    typeof payload.kind === 'string' && payload.kind ? payload.kind : null
  return { from, to, kind }
}
