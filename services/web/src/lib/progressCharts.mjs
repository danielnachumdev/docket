/** Sum segment values, treating negatives as zero. */
export function chartTotal(segments) {
  return segments.reduce((sum, s) => sum + Math.max(0, s.value), 0)
}

/** Derive exclusive WIP age buckets from cumulative older_than_* counts. */
export function wipAgeBuckets(wip) {
  const old = Math.max(0, wip.open_older_than_30d)
  const mid = Math.max(0, wip.open_older_than_7d - old)
  const fresh = Math.max(0, wip.open - wip.open_older_than_7d)
  return { fresh, mid, old }
}
