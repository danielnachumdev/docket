export type ChartSegment = {
  key: string
  label: string
  value: number
  color: string
}

export function chartTotal(segments: ChartSegment[]): number

export function wipAgeBuckets(wip: {
  open: number
  open_older_than_7d: number
  open_older_than_30d: number
}): { fresh: number; mid: number; old: number }
